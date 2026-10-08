import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// This suite isolates state transitions. stripe-settlement suites exercise the real verifier and provider receipt chain.
vi.mock('@/lib/stripe-settlement', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/stripe-settlement')>(),
  verifyDestinationSettlement: async (booking: any, _attempt: unknown, _intent: string, charge?: string | null) => ({
    chargeId: charge || booking.payment.stripeChargeId || 'ch_synthetic',
    transferId: 'tr_synthetic', hasRefunds: false, requiresReview: false,
  }),
}))
import { closeCancelledCheckout, startOrResumeCheckout } from '@/lib/checkout-attempts'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), create: vi.fn(), retrieve: vi.fn(), expire: vi.fn(), intent: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: mock.create, retrieve: mock.retrieve, expire: mock.expire } }, paymentIntents: { retrieve: mock.intent } } }))
vi.mock('@/lib/app-url', () => ({ toAbsoluteAppUrl: (path: string) => `https://trainr.test${path}` }))

const buyer = { id: 'parent', email: 'parent@example.test' }
let state: any
let sessions: Map<string, any>
let accepted: Map<string, any>
let failSave: boolean
let failAfterAccept: boolean

function pendingPayment() {
  return { id: 'payment', status: 'PENDING', amountInCents: 10000, platformFeeInCents: 1500, trainerPayoutInCents: 8500,
    refundAmountInCents: 0, stripeCheckoutSessionId: null, stripePaymentIntentId: null, stripeChargeId: null, stripeTransferId: null }
}

beforeEach(() => {
  vi.resetAllMocks()
  failSave = false
  failAfterAccept = false
  sessions = new Map()
  accepted = new Map()
  state = {
    buyer: { role: 'PARENT', deletedAt: null },
    booking: { id: 'booking', status: 'PENDING', totalAmountInCents: 10000, platformFeeInCents: 1500, trainerPayoutInCents: 8500,
      date: new Date('2026-11-01'), startTime: '09:00', parentProfile: { id: 'parent-profile', userId: 'parent' },
      trainerProfile: { id: 'trainer', userId: 'trainer-user', stripeAccountId: 'acct_ready', firstName: 'Test', lastName: 'Trainer', isActive: true, approvalStatus: 'APPROVED' },
      athleteProfile: { id: 'athlete' }, serviceOffering: { id: 'service', title: 'Training' } },
    payment: null, attempts: [], notifications: [],
  }
  let tail = Promise.resolve()
  // A serial transaction model tests interleavings and rollback, not PostgreSQL itself.
  mock.transaction.mockImplementation(async (run) => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    const before = structuredClone(state)
    try {
      return await run({
        $queryRaw: mock.query,
        user: { findUnique: async () => structuredClone(state.buyer) },
        booking: {
          findUnique: async () => structuredClone({ ...state.booking, payment: state.payment }),
          updateMany: async ({ where, data }: any) => {
            const allowed = typeof where.status === 'string' ? [where.status] : where.status.in
            if (!allowed.includes(state.booking.status)) return { count: 0 }
            Object.assign(state.booking, data)
            return { count: 1 }
          },
        },
        notification: { createMany: async ({ data }: any) => state.notifications.push(...data) },
        payment: {
          create: async ({ data }: any) => { state.payment = { ...pendingPayment(), ...data }; return structuredClone(state.payment) },
          update: async ({ data }: any) => { Object.assign(state.payment, data); return structuredClone(state.payment) },
        },
        checkoutAttempt: {
          findFirst: async () => structuredClone(state.attempts.at(-1) || null),
          create: async ({ data }: any) => {
            if (!data.retiredAt && state.attempts.some((attempt: any) => !attempt.retiredAt)) throw new Error('duplicate active attempt')
            const attempt = { id: `legacy-${state.attempts.length}`, createdAt: new Date(), retiredAt: null, stripeCheckoutSessionId: null, ...data }
            state.attempts.push(attempt)
            return structuredClone(attempt)
          },
          update: async ({ where, data }: any) => {
            if (failSave) { failSave = false; throw new Error('database write failed') }
            const attempt = state.attempts.find((item: any) => item.id === where.id)
            Object.assign(attempt, data)
            return structuredClone(attempt)
          },
        },
      })
    } catch (error) {
      state = before
      throw error
    } finally { release() }
  })
  mock.create.mockImplementation(async (parameters, options) => {
    const key = options.idempotencyKey
    if (!accepted.has(key)) {
      const session = {
        id: `cs_${accepted.size + 1}`, mode: 'payment', currency: 'usd', amount_total: parameters.line_items[0].price_data.unit_amount,
        payment_status: 'unpaid', status: 'open', payment_intent: null,
        url: `https://checkout.stripe.com/session-${accepted.size + 1}`, metadata: parameters.metadata,
      }
      accepted.set(key, { parameters: structuredClone(parameters), session })
      sessions.set(session.id, session)
    }
    expect(parameters).toEqual(accepted.get(key).parameters)
    if (failAfterAccept) { failAfterAccept = false; throw new Error('connection timed out after acceptance') }
    return structuredClone(accepted.get(key).session)
  })
  mock.retrieve.mockImplementation(async (id) => {
    if (!sessions.has(id)) throw new Error('Stripe resource_missing')
    return structuredClone(sessions.get(id))
  })
  mock.intent.mockResolvedValue({ status: 'canceled' })
  mock.expire.mockImplementation(async (id) => {
    const session = sessions.get(id)
    if (!session || session.status !== 'open') throw new Error('not open')
    session.status = 'expired'
    session.url = null
    return structuredClone(session)
  })
})
afterEach(() => vi.useRealTimers())

const checkout = (user = buyer) => startOrResumeCheckout('booking', user, 'acct_ready')

describe('checkout buyer revocation', () => {
  it.each(['TRAINER', 'ADMIN', 'deleted', 'missing'])('blocks a %s buyer before provider or payment writes', async change => {
    if (change === 'missing') state.buyer = null
    else if (change === 'deleted') state.buyer.deletedAt = new Date()
    else state.buyer.role = change
    await expect(checkout()).rejects.toThrow('Parent access')
    expect(state.payment).toBeNull()
    expect(state.attempts).toHaveLength(0)
    expect(mock.create).not.toHaveBeenCalled()
    expect(mock.retrieve).not.toHaveBeenCalled()
  })
  it.each(['role', 'deleted'])('retains and expires the returned session when buyer %s changes during creation', async change => {
    const create = mock.create.getMockImplementation()!
    mock.create.mockImplementation(async (...args) => {
      const session = await create(...args)
      if (change === 'role') state.buyer.role = 'TRAINER'
      else state.buyer.deletedAt = new Date()
      return session
    })
    await expect(checkout()).rejects.toThrow('Parent account access changed')
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
    expect(state.attempts[0].stripeCheckoutSessionId).toBe('cs_1')
    expect(sessions.get('cs_1').status).toBe('expired')
    expect(state.payment.status).toBe('PENDING')
    expect(state.booking.status).toBe('PENDING')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
})

describe('withheld checkout recovery', () => {
  const revokeAfterCreate = () => {
    const create = mock.create.getMockImplementation()!
    mock.create.mockImplementationOnce(async (...args) => {
      const session = await create(...args)
      state.buyer.role = 'TRAINER'
      return session
    })
  }
  it('withholds a resumed URL if the buyer is deactivated during retrieval', async () => {
    await checkout()
    const retrieve = mock.retrieve.getMockImplementation()!
    mock.retrieve.mockImplementation(async (...args) => {
      const session = await retrieve(...args)
      state.buyer.deletedAt = new Date()
      return session
    })
    await expect(checkout()).rejects.toThrow('Parent account access changed')
    expect(mock.create).toHaveBeenCalledTimes(1)
    expect(sessions.get('cs_1').status).toBe('expired')
    expect(mock.expire).toHaveBeenCalledWith('cs_1', {}, { timeout: 8000, maxNetworkRetries: 0, idempotencyKey: 'trainr-withheld-cs_1' })
  })
  it('keeps a known session and pending money state when expiry fails', async () => {
    revokeAfterCreate()
    mock.expire.mockRejectedValue(new Error('provider unavailable'))
    await expect(checkout()).rejects.toThrow('contact support to reconcile')
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
    expect(state.payment.status).toBe('PENDING')
    expect(state.attempts[0].retiredAt).toBeNull()
    expect(sessions.get('cs_1').status).toBe('open')
    await expect(checkout()).rejects.toThrow('Parent access')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
  it('does not undo a fast webhook settlement if payment wins the expiry race', async () => {
    revokeAfterCreate()
    mock.expire.mockImplementation(async () => {
      state.payment.status = 'SUCCEEDED'
      state.payment.stripePaymentIntentId = 'pi_paid'
      state.booking.status = 'CONFIRMED'
      throw new Error('session already completed')
    })
    await expect(checkout()).rejects.toThrow('contact support to reconcile')
    expect(state.payment).toMatchObject({ stripeCheckoutSessionId: 'cs_1', stripePaymentIntentId: 'pi_paid', status: 'SUCCEEDED' })
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.attempts).toHaveLength(1)
  })
  it.each(['identity', 'open', 'recovery'])('does not release a URL or claim closure for an inconsistent expiry response: %s', async problem => {
    revokeAfterCreate()
    mock.expire.mockImplementation(async () => ({ ...structuredClone(sessions.get('cs_1')), status: 'expired',
      ...(problem === 'identity' ? { id: 'cs_wrong' } : problem === 'open' ? { status: 'open' } : { after_expiration: { recovery: { enabled: true } } }) }))
    await expect(checkout()).rejects.toThrow('contact support to reconcile')
    expect(state.payment).toMatchObject({ stripeCheckoutSessionId: 'cs_1', status: 'PENDING' })
    expect(state.attempts[0].retiredAt).toBeNull()
  })
  it('allows a currently restored parent to replace only the provider-verified expired session', async () => {
    revokeAfterCreate()
    await expect(checkout()).rejects.toThrow('Parent account access changed')
    state.buyer.role = 'PARENT'
    expect(await checkout()).toMatchObject({ checkoutUrl: 'https://checkout.stripe.com/session-2' })
    expect(state.attempts).toHaveLength(2)
    expect(state.attempts[0]).toMatchObject({ stripeCheckoutSessionId: 'cs_1', retiredAt: expect.any(Date) })
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_2')
  })
  it('retains an expired identity without replacement when revocation wins during retrieval', async () => {
    await checkout()
    Object.assign(sessions.get('cs_1'), { status: 'expired', url: null })
    const retrieve = mock.retrieve.getMockImplementation()!
    mock.retrieve.mockImplementation(async (...args) => {
      const session = await retrieve(...args)
      state.buyer.role = 'TRAINER'
      return session
    })
    await expect(checkout()).rejects.toThrow('Parent account access changed')
    expect(mock.create).toHaveBeenCalledTimes(1)
    expect(mock.expire).not.toHaveBeenCalled()
    expect(state.attempts).toHaveLength(1)
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
  })
})

describe('cancelled checkout closure', () => {
  const cancel = async () => { state.booking.status = 'CANCELLED'; return closeCancelledCheckout('booking') }
  it('does not touch Stripe for a booking that is not cancelled', async () => {
    expect(await closeCancelledCheckout('booking')).toBe('review_required')
    expect(mock.create).not.toHaveBeenCalled()
    expect(mock.retrieve).not.toHaveBeenCalled()
  })
  it('needs no provider action when checkout was never started', async () => {
    expect(await cancel()).toBe('not_required')
    expect(mock.create).not.toHaveBeenCalled()
  })
  it('expires a saved open session and safely repeats closure', async () => {
    await checkout()
    expect(await cancel()).toBe('closed')
    expect(await cancel()).toBe('closed')
    expect(mock.expire).toHaveBeenCalledTimes(1)
    expect(mock.expire.mock.calls[0][2]).toMatchObject({ idempotencyKey: 'trainr-cancel-cs_1', timeout: 8000, maxNetworkRetries: 0 })
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
    expect(state.payment.status).toBe('PENDING')
    await expect(checkout()).rejects.toThrow('cannot be paid')
  })
  it('recovers an accepted but unsaved session using only the original key', async () => {
    failAfterAccept = true
    await expect(checkout()).rejects.toThrow('timed out')
    expect(await cancel()).toBe('closed')
    expect(accepted.size).toBe(1)
    expect(state.attempts).toHaveLength(1)
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
  })
  it('preserves and expires the session when cancellation wins during creation', async () => {
    const create = mock.create.getMockImplementation()!
    mock.create.mockImplementation(async (...args) => {
      const session = await create(...args)
      state.booking.status = 'CANCELLED'
      return session
    })
    await expect(checkout()).rejects.toThrow('cannot be paid')
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
    expect(sessions.get('cs_1').status).toBe('expired')
  })
  it('requires review rather than replaying an aged-out creation key', async () => {
    failAfterAccept = true
    await expect(checkout()).rejects.toThrow()
    state.attempts[0].createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000)
    expect(await cancel()).toBe('review_required')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
  it('requires review for unknown legacy activity with no durable attempt', async () => {
    state.payment = pendingPayment()
    expect(await cancel()).toBe('review_required')
    expect(mock.create).not.toHaveBeenCalled()
  })
  it.each(['intent', 'amount', 'fee', 'destination', 'metadata'])('does not recover creation with inconsistent saved %s', async mismatch => {
    failAfterAccept = true
    await expect(checkout()).rejects.toThrow()
    const saved = state.attempts[0].parameters
    if (mismatch === 'intent') state.payment.stripePaymentIntentId = 'pi_unlinked'
    if (mismatch === 'amount') saved.line_items[0].price_data.unit_amount++
    if (mismatch === 'fee') saved.payment_intent_data.application_fee_amount++
    if (mismatch === 'destination') saved.payment_intent_data.transfer_data.destination = 'acct_other'
    if (mismatch === 'metadata') saved.metadata.paymentId = 'other'
    expect(await cancel()).toBe('review_required')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
  it('does not claim closure when expiry permits recovered checkouts', async () => {
    await checkout()
    sessions.get('cs_1').after_expiration = { recovery: { enabled: true } }
    expect(await cancel()).toBe('review_required')
  })
  it('retrieves after an ambiguous expire response and recognizes actual expiry', async () => {
    await checkout()
    const expire = mock.expire.getMockImplementation()!
    mock.expire.mockImplementation(async (...args) => { await expire(...args); throw new Error('lost response') })
    expect(await cancel()).toBe('closed')
  })
  it('does not claim closure during a provider outage', async () => {
    await checkout()
    mock.retrieve.mockRejectedValue(new Error('private-provider-diagnostic'))
    expect(await cancel()).toBe('review_required')
    expect(state.booking.status).toBe('CANCELLED')
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
  })
  it('rechecks database money state after expiry rather than reporting a stale closure', async () => {
    await checkout()
    const expire = mock.expire.getMockImplementation()!
    mock.expire.mockImplementation(async (...args) => {
      const session = await expire(...args)
      state.payment.status = 'SUCCEEDED'
      state.payment.stripePaymentIntentId = 'pi_late'
      return session
    })
    expect(await cancel()).toBe('review_required')
    expect(state.payment.status).toBe('SUCCEEDED')
  })
  it.each(['processing', 'requires_payment_method', 'succeeded'])('does not treat an unresolved intent (%s) as closed', async status => {
    await checkout()
    sessions.get('cs_1').payment_intent = 'pi_1'
    mock.intent.mockResolvedValue({ id: 'pi_1', status })
    expect(await cancel()).toBe('review_required')
  })
  it('accepts a matching canceled intent only after session expiry', async () => {
    await checkout()
    sessions.get('cs_1').payment_intent = 'pi_1'
    mock.intent.mockResolvedValue({ id: 'pi_1', status: 'canceled' })
    expect(await cancel()).toBe('closed')
  })
  it.each(['metadata', 'amount', 'identity'])('does not mutate mismatched provider %s', async mismatch => {
    await checkout()
    const session = sessions.get('cs_1')
    if (mismatch === 'metadata') session.metadata.bookingId = 'other'
    if (mismatch === 'amount') session.amount_total++
    if (mismatch === 'identity') session.id = 'other'
    expect(await cancel()).toBe('review_required')
    expect(mock.expire).not.toHaveBeenCalled()
  })
  it('keeps payment processing under review without expiring or refunding it', async () => {
    await checkout()
    sessions.get('cs_1').status = 'complete'
    expect(await cancel()).toBe('review_required')
    expect(mock.expire).not.toHaveBeenCalled()
  })
  it('records a late paid observation without reopening a cancelled booking', async () => {
    await checkout()
    Object.assign(sessions.get('cs_1'), { status: 'complete', payment_status: 'paid', payment_intent: 'pi_1' })
    expect(await cancel()).toBe('review_required')
    expect(state.booking.status).toBe('CANCELLED')
    expect(state.payment.status).toBe('SUCCEEDED')
    expect(mock.expire).not.toHaveBeenCalled()
  })
})

describe('durable checkout attempts', () => {
  it.each(['PENDING', 'REJECTED', 'SUSPENDED', 'INACTIVE'])('does not create payment/attempt records for an ineligible trainer: %s', async status => {
    if (status === 'INACTIVE') state.booking.trainerProfile.isActive = false
    else state.booking.trainerProfile.approvalStatus = status
    await expect(checkout()).rejects.toThrow('not available for checkout')
    expect(state.payment).toBeNull()
    expect(state.attempts).toHaveLength(0)
    expect(mock.create).not.toHaveBeenCalled()
  })
  it('does not resume a known checkout after suspension', async () => {
    await checkout()
    state.booking.trainerProfile.approvalStatus = 'SUSPENDED'
    await expect(checkout()).rejects.toThrow('not available for checkout')
    expect(mock.create).toHaveBeenCalledTimes(1)
    expect(mock.retrieve).not.toHaveBeenCalled()
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
  })
  it.each(['suspend', 'deactivate'])('preserves the session identity but withholds its URL when an admin can %s during the provider call', async action => {
    const create = mock.create.getMockImplementation()!
    mock.create.mockImplementation(async (...args) => {
      const session = await create(...args)
      if (action === 'suspend') state.booking.trainerProfile.approvalStatus = 'SUSPENDED'
      else state.booking.trainerProfile.isActive = false
      return session
    })
    await expect(checkout()).rejects.toThrow('no longer available')
    expect(sessions.get('cs_1').status).toBe('expired')
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
    expect(state.attempts[0].stripeCheckoutSessionId).toBe('cs_1')
    expect(state.payment.status).toBe('PENDING')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
  it.each([0, 1, 49, 50.5, 100000000])('rejects an invalid existing booking total %s before persisting or contacting Stripe', async (total) => {
    Object.assign(state.booking, { totalAmountInCents: total, platformFeeInCents: 0, trainerPayoutInCents: total })
    await expect(checkout()).rejects.toThrow('amounts are invalid')
    expect(state.payment).toBeNull()
    expect(state.attempts).toHaveLength(0)
    expect(mock.create).not.toHaveBeenCalled()
    expect(mock.retrieve).not.toHaveBeenCalled()
  })

  it('accepts the minimum USD amount with an exact stored split', async () => {
    Object.assign(state.booking, { totalAmountInCents: 50, platformFeeInCents: 8, trainerPayoutInCents: 42 })
    await checkout()
    expect(state.payment.amountInCents).toBe(50)
    expect(state.attempts[0].parameters.line_items[0].price_data.unit_amount).toBe(50)
    expect(state.attempts[0].parameters.payment_intent_data.application_fee_amount).toBe(8)
  })

  it('rejects fractional split cents even when their sum matches the total', async () => {
    Object.assign(state.booking, { platformFeeInCents: 1500.5, trainerPayoutInCents: 8499.5 })
    await expect(checkout()).rejects.toThrow('amounts are invalid')
    expect(mock.create).not.toHaveBeenCalled()
  })

  it('persists the immutable destination-charge request before calling Stripe', async () => {
    await checkout()
    expect(state.attempts).toHaveLength(1)
    const attempt = state.attempts[0]
    expect(mock.create).toHaveBeenCalledWith(attempt.parameters, { idempotencyKey: `trainr-checkout-${attempt.id}` })
    expect(attempt.parameters.payment_intent_data).toMatchObject({ application_fee_amount: 1500, transfer_data: { destination: 'acct_ready' } })
    expect(attempt.parameters.metadata).toEqual({ bookingId: 'booking', paymentId: 'payment', checkoutAttemptId: attempt.id })
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
    expect(mock.query.mock.calls[0][0].join('?')).toBe('SELECT id FROM users WHERE id = ? FOR SHARE')
    expect(mock.query.mock.calls[1][0].join('?')).toBe('SELECT id FROM bookings WHERE id = ? FOR UPDATE')
  })

  it('resumes an existing open session without expiring or creating another session', async () => {
    const first = await checkout()
    expect(await checkout()).toEqual(first)
    expect(mock.create).toHaveBeenCalledTimes(1)
    expect(mock.retrieve).toHaveBeenCalledWith('cs_1')
  })

  it('uses one attempt and idempotency key for concurrent double-clicks', async () => {
    const results = await Promise.all([checkout(), checkout(), checkout()])
    expect(new Set(results.map((result) => result.checkoutUrl)).size).toBe(1)
    expect(state.attempts).toHaveLength(1)
    expect(accepted.size).toBe(1)
    expect(new Set(mock.create.mock.calls.map((call) => call[1].idempotencyKey)).size).toBe(1)
  })

  it('recovers the same session and exact parameters after an uncertain provider response', async () => {
    failAfterAccept = true
    await expect(checkout()).rejects.toThrow('timed out')
    expect(state.payment).not.toBeNull()
    expect(state.attempts[0].stripeCheckoutSessionId).toBeNull()
    state.booking.serviceOffering.title = 'Edited title'
    await checkout({ ...buyer, email: 'changed@example.test' })
    expect(accepted.size).toBe(1)
    expect(mock.create.mock.calls[1][0]).toEqual(mock.create.mock.calls[0][0])
  })

  it('recovers after Stripe succeeded but saving the session failed', async () => {
    failSave = true
    await expect(checkout()).rejects.toThrow('database write failed')
    expect(state.attempts).toHaveLength(1)
    expect(state.payment.stripeCheckoutSessionId).toBeNull()
    await checkout()
    expect(accepted.size).toBe(1)
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_1')
  })

  it('blocks unknown outcomes after 23 hours instead of reusing a prunable Stripe key', async () => {
    failAfterAccept = true
    await expect(checkout()).rejects.toThrow()
    state.attempts[0].createdAt = new Date(Date.now() - 23 * 60 * 60 * 1000)
    await expect(checkout()).rejects.toThrow('safe retry window')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('still retrieves a known session after the recovery window', async () => {
    await checkout()
    state.attempts[0].createdAt = new Date(0)
    await checkout()
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('replaces only a verified expired session and retains its attempt history', async () => {
    await checkout()
    Object.assign(sessions.get('cs_1'), { status: 'expired', url: null, payment_intent: 'pi_old' })
    Object.assign(state.payment, { status: 'FAILED', stripePaymentIntentId: 'pi_old' })
    await checkout()
    expect(mock.intent).toHaveBeenCalledWith('pi_old')
    expect(state.attempts).toHaveLength(2)
    expect(state.attempts[0].retiredAt).toBeInstanceOf(Date)
    expect(state.attempts[1].sequence).toBe(2)
    expect(state.payment.stripeCheckoutSessionId).toBe('cs_2')
    expect(state.payment.stripePaymentIntentId).toBeNull()
    expect(state.payment.status).toBe('PENDING')
  })

  it.each(['succeeded', 'processing', 'requires_capture', 'requires_payment_method'])('does not replace an expired session with unresolved intent %s', async (status) => {
    await checkout()
    Object.assign(sessions.get('cs_1'), { status: 'expired', payment_intent: 'pi_old' })
    mock.intent.mockResolvedValue({ status })
    await expect(checkout()).rejects.toThrow('unresolved payment intent')
    expect(accepted.size).toBe(1)
  })

  it('does not interpret a missing Stripe resource as permission to create another session', async () => {
    await checkout()
    mock.retrieve.mockRejectedValue({ type: 'StripeInvalidRequestError', code: 'resource_missing' })
    await expect(checkout()).rejects.toMatchObject({ code: 'resource_missing' })
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('reconciles paid sessions when the payment webhook has not arrived without creating another session', async () => {
    await checkout()
    Object.assign(sessions.get('cs_1'), { status: 'complete', payment_status: 'paid', payment_intent: 'pi_paid' })
    await expect(checkout()).rejects.toThrow('already processing or completed')
    expect(state.payment.status).toBe('SUCCEEDED')
    expect(state.booking.status).toBe('CONFIRMED')
    expect(state.notifications).toHaveLength(2)
    expect(state.notifications.map((notification: any) => notification.userId)).toEqual(['trainer-user', 'parent'])
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('blocks complete unpaid sessions without treating them as paid', async () => {
    await checkout()
    Object.assign(sessions.get('cs_1'), { status: 'complete', payment_status: 'unpaid' })
    await expect(checkout()).rejects.toThrow('already processing or completed')
    expect(state.payment.status).toBe('PENDING')
    expect(state.notifications).toHaveLength(0)
  })

  it.each(['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'PROCESSING'])('does not reset financial state %s', async (status) => {
    await checkout()
    state.payment.status = status
    await expect(checkout()).rejects.toThrow('financial activity')
    expect(state.payment.status).toBe(status)
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('withholds a URL if a fast webhook settles before finalization', async () => {
    const create = mock.create.getMockImplementation()!
    mock.create.mockImplementation(async (...args) => {
      const session = await create(...args)
      state.payment.status = 'SUCCEEDED'
      state.payment.stripePaymentIntentId = 'pi_paid'
      return session
    })
    await expect(checkout()).rejects.toThrow('financial activity')
    expect(state.payment.status).toBe('SUCCEEDED')
    expect(state.payment.stripePaymentIntentId).toBe('pi_paid')
  })

  it('withholds a URL if the booking is cancelled while Stripe is responding', async () => {
    const create = mock.create.getMockImplementation()!
    mock.create.mockImplementation(async (...args) => { const session = await create(...args); state.booking.status = 'CANCELLED'; return session })
    await expect(checkout()).rejects.toThrow('current state')
    expect(state.booking.status).toBe('CANCELLED')
  })

  it('rejects a changed connected-account destination instead of modifying a saved request', async () => {
    failAfterAccept = true
    await expect(checkout()).rejects.toThrow()
    state.attempts[0].parameters.payment_intent_data.transfer_data.destination = 'acct_old'
    await expect(checkout()).rejects.toThrow('destination')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('requires reconciliation for legacy records with an unknown session outcome', async () => {
    state.payment = pendingPayment()
    await expect(checkout()).rejects.toThrow('Legacy checkout outcome is unknown')
    expect(mock.create).not.toHaveBeenCalled()
  })

  it('resumes a known legacy session without creating a new attempt', async () => {
    state.payment = { ...pendingPayment(), stripeCheckoutSessionId: 'cs_legacy' }
    sessions.set('cs_legacy', { id: 'cs_legacy', mode: 'payment', currency: 'usd', amount_total: 10000,
      status: 'open', payment_status: 'unpaid', metadata: { bookingId: 'booking', paymentId: 'payment' }, url: 'https://checkout.stripe.com/legacy' })
    expect((await checkout()).checkoutUrl).toContain('legacy')
    expect(mock.create).not.toHaveBeenCalled()
    expect(state.attempts).toHaveLength(0)
  })

  it('preserves a legacy expired session in retired history before creating its replacement', async () => {
    state.payment = { ...pendingPayment(), stripeCheckoutSessionId: 'cs_legacy' }
    sessions.set('cs_legacy', { id: 'cs_legacy', mode: 'payment', currency: 'usd', amount_total: 10000,
      status: 'expired', payment_status: 'unpaid', payment_intent: null, metadata: { bookingId: 'booking', paymentId: 'payment' }, url: null })
    await checkout()
    expect(state.attempts).toHaveLength(2)
    expect(state.attempts[0].stripeCheckoutSessionId).toBe('cs_legacy')
    expect(state.attempts[0].retiredAt).toBeInstanceOf(Date)
    expect(state.attempts[1].sequence).toBe(2)
  })

  it('rejects incorrect provider identity and amount', async () => {
    await checkout()
    sessions.get('cs_1').metadata.paymentId = 'another-payment'
    await expect(checkout()).rejects.toThrow('identity or amount')
    sessions.get('cs_1').metadata.paymentId = 'payment'
    sessions.get('cs_1').amount_total = 1
    await expect(checkout()).rejects.toThrow('identity or amount')
  })

  it('does not return a session with a different intent from the stored payment', async () => {
    await checkout()
    state.payment.stripePaymentIntentId = 'pi_recorded'
    sessions.get('cs_1').payment_intent = 'pi_different'
    await expect(checkout()).rejects.toThrow('session or payment intent')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })

  it('does not return a different session ID from the one requested', async () => {
    await checkout()
    sessions.get('cs_1').id = 'cs_wrong'
    await expect(checkout()).rejects.toThrow('session or payment intent')
    expect(mock.create).toHaveBeenCalledTimes(1)
  })
})
