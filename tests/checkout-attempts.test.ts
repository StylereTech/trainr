import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startOrResumeCheckout } from '@/lib/checkout-attempts'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), create: vi.fn(), retrieve: vi.fn(), intent: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))
vi.mock('@/lib/stripe', () => ({ stripe: { checkout: { sessions: { create: mock.create, retrieve: mock.retrieve } }, paymentIntents: { retrieve: mock.intent } } }))
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
})
afterEach(() => vi.useRealTimers())

const checkout = (user = buyer) => startOrResumeCheckout('booking', user, 'acct_ready')

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
    expect(mock.query.mock.calls[0][0].join('?')).toBe('SELECT id FROM bookings WHERE id = ? FOR UPDATE')
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
