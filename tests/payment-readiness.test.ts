import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isStripeAccountReady } from '@/lib/stripe-account'
import type Stripe from 'stripe'

const mocks = vi.hoisted(() => ({
  event: vi.fn(),
  account: vi.fn(),
  session: vi.fn(),
  trainer: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  transaction: vi.fn(),
  query: vi.fn(),
  booking: { findUnique: vi.fn(), updateMany: vi.fn() },
  payment: { update: vi.fn() },
  notification: { createMany: vi.fn() },
  wallet: { update: vi.fn(), create: vi.fn() },
}))
vi.mock('@/lib/auth', () => ({ authOptions: {}, getServerSession: mocks.session, getRequestUser: async () => (await mocks.session())?.user }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  $transaction: mocks.transaction,
  trainerProfile: mocks.trainer, booking: mocks.booking, payment: mocks.payment,
  notification: mocks.notification, trainerWallet: mocks.wallet,
} }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'stripe-signature': 'verified-by-mock' }) }))
vi.mock('@/lib/stripe', () => ({
  stripeRuntimeStatus: () => ({ secretConfigured: true, webhookConfigured: true }),
  verifyWebhookSignature: mocks.event,
  stripe: { accounts: { retrieve: mocks.account } },
  createConnectedAccount: vi.fn(), createAccountLink: vi.fn(),
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.transaction.mockImplementation(async (run) => run({
    $queryRaw: mocks.query, booking: mocks.booking, payment: mocks.payment, notification: mocks.notification,
    checkoutAttempt: { findFirst: async () => null },
  }))
  mocks.booking.updateMany.mockResolvedValue({ count: 1 })
  mocks.session.mockResolvedValue({ user: { id: 'trainer-user', role: 'TRAINER' } })
})

describe('Stripe account readiness', () => {
  it('accepts the SDK active-account type without casting away its deleted field', () => {
    const account: Pick<Stripe.Account, 'deleted' | 'details_submitted' | 'charges_enabled' | 'payouts_enabled'> = {
      details_submitted: true, charges_enabled: true, payouts_enabled: true,
    }
    expect(isStripeAccountReady(account)).toBe(true)
  })

  it.each([
    [true, true, true, true], [true, true, false, false],
    [true, false, true, false], [false, true, true, false],
  ])('details=%s charges=%s payouts=%s gives readiness=%s', (details, charges, payouts, expected) => {
    expect(isStripeAccountReady({ details_submitted: details, charges_enabled: charges, payouts_enabled: payouts })).toBe(expected)
  })

  it('rejects deleted or incomplete accounts', () => {
    expect(isStripeAccountReady({})).toBe(false)
    expect(isStripeAccountReady({ deleted: true, details_submitted: true, charges_enabled: true, payouts_enabled: true })).toBe(false)
  })

  it('revokes cached readiness when the trainer status endpoint sees disabled payouts', async () => {
    mocks.trainer.findUnique.mockResolvedValue({ id: 'trainer', isActive: true, user: { role: 'TRAINER', deletedAt: null, sessionVersion: 0 }, stripeAccountId: 'acct_test', stripeOnboardingComplete: true })
    mocks.account.mockResolvedValue({ id: 'acct_test', type: 'express', details_submitted: true, charges_enabled: true, payouts_enabled: false })
    const { GET } = await import('@/app/api/trainer/stripe-connect/route')
    const response = await GET(new Request('http://localhost/api/trainer/stripe-connect') as any)
    expect((await response.json()).onboardingComplete).toBe(false)
    expect(mocks.trainer.updateMany).toHaveBeenCalledWith({ where: { id: 'trainer', stripeAccountId: 'acct_test' }, data: { stripeOnboardingComplete: false } })
  })
})

describe('Stripe webhook payment guards', () => {
  async function send(type: string, object: object) {
    mocks.event.mockResolvedValue({ type, data: { object } })
    const { POST } = await import('@/app/api/payments/webhook/route')
    return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body: '{}' }) as any)
  }

  it('does not confirm or credit an unpaid completed checkout', async () => {
    const response = await send('checkout.session.completed', { payment_status: 'unpaid', metadata: { bookingId: 'booking' } })
    expect(response.status).toBe(200)
    expect(mocks.booking.findUnique).not.toHaveBeenCalled()
    expect(mocks.payment.update).not.toHaveBeenCalled()
  })

  it.each(['checkout.session.completed', 'checkout.session.async_payment_succeeded'])(
    'rejects a mismatched amount for %s', async (type) => {
      mocks.booking.findUnique.mockResolvedValue({ totalAmountInCents: 7500, payment: { id: 'payment', amountInCents: 7500 } })
      const response = await send(type, { payment_status: 'paid', amount_total: 1, currency: 'usd', metadata: { bookingId: 'booking' } })
      expect(response.status).toBe(409)
      expect(mocks.payment.update).not.toHaveBeenCalled()
    },
  )

  it('revokes cached onboarding when account.updated disables payments', async () => {
    const response = await send('account.updated', { id: 'acct_test', details_submitted: true, charges_enabled: false, payouts_enabled: true })
    expect(response.status).toBe(200)
    expect(mocks.trainer.updateMany).toHaveBeenCalledWith({ where: { stripeAccountId: 'acct_test' }, data: { stripeOnboardingComplete: false } })
  })

  it('records the stored booking split without crediting a second withdrawable wallet', async () => {
    mocks.booking.findUnique.mockResolvedValue({
      id: 'booking', status: 'PENDING',
      totalAmountInCents: 7500, platformFeeInCents: 1000, trainerPayoutInCents: 6500,
      payment: { id: 'payment', status: 'PENDING', amountInCents: 7500, platformFeeInCents: 1000, trainerPayoutInCents: 6500 },
      trainerProfileId: 'trainer', trainerProfile: { userId: 'trainer-user', firstName: 'Test', lastName: 'Trainer' },
      parentProfile: { userId: 'parent-user' }, date: new Date('2026-11-01'),
    })
    const response = await send('checkout.session.completed', {
      id: 'cs_test', payment_intent: 'pi_test', payment_status: 'paid', amount_total: 7500,
      currency: 'usd', metadata: { bookingId: 'booking', paymentId: 'payment' },
    })
    expect(response.status).toBe(200)
    expect(mocks.payment.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'SUCCEEDED' }),
    }))
    expect(mocks.payment.update.mock.calls[0][0].data).not.toHaveProperty('trainerPayoutInCents')
    expect(mocks.wallet.update).not.toHaveBeenCalled()
    expect(mocks.wallet.create).not.toHaveBeenCalled()
  })
})
