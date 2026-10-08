import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CheckoutConflict } from '@/lib/checkout-attempts'

const mock = vi.hoisted(() => ({ user: vi.fn(), booking: vi.fn(), account: vi.fn(), updateTrainer: vi.fn(), checkout: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.user }))
vi.mock('@/lib/prisma', () => ({ prisma: { booking: { findUnique: mock.booking }, trainerProfile: { update: mock.updateTrainer } } }))
vi.mock('@/lib/checkout-attempts', () => ({ CheckoutConflict: class extends Error {}, startOrResumeCheckout: mock.checkout }))
vi.mock('@/lib/stripe', () => ({
  stripeRuntimeStatus: () => ({ secretConfigured: true }),
  mapStripeError: () => ({ message: 'Checkout temporarily unavailable', detail: 'private provider detail', status: 503 }),
  stripe: { accounts: { retrieve: mock.account } },
}))

beforeEach(() => {
  vi.resetAllMocks()
  mock.user.mockResolvedValue({ id: 'parent', role: 'PARENT', email: 'parent@example.test' })
  mock.booking.mockResolvedValue({
    id: 'booking', status: 'PENDING', parentProfile: { userId: 'parent' },
    trainerProfile: { id: 'trainer', stripeAccountId: 'acct_ready', stripeOnboardingComplete: true },
  })
  mock.account.mockResolvedValue({ details_submitted: true, charges_enabled: true, payouts_enabled: true })
  mock.checkout.mockResolvedValue({ checkoutUrl: 'https://checkout.stripe.com/test', paymentId: 'payment' })
})

async function send(body = JSON.stringify({ bookingId: 'booking' })) {
  const { POST } = await import('@/app/api/payments/checkout/route')
  return POST(new Request('http://localhost/api/payments/checkout', { method: 'POST', body }) as any)
}

describe('checkout route boundaries', () => {
  it('passes only the authenticated buyer and verified trainer destination to checkout', async () => {
    expect((await send()).status).toBe(200)
    expect(mock.checkout).toHaveBeenCalledWith('booking', { id: 'parent', role: 'PARENT', email: 'parent@example.test' }, 'acct_ready')
  })
  it('requires authentication', async () => {
    mock.user.mockResolvedValue(null)
    expect((await send()).status).toBe(401)
    expect(mock.account).not.toHaveBeenCalled()
  })
  it.each(['TRAINER', 'ADMIN', 'UNKNOWN'])('rejects role %s', async (role) => {
    mock.user.mockResolvedValue({ id: 'parent', role })
    expect((await send()).status).toBe(403)
    expect(mock.checkout).not.toHaveBeenCalled()
  })
  it.each(['{', '{}', '{"bookingId":{}}', '{"bookingId":" "}'])('rejects malformed input %s', async (body) => {
    expect((await send(body)).status).toBe(400)
    expect(mock.booking).not.toHaveBeenCalled()
  })
  it('rejects another parent booking', async () => {
    const booking = await mock.booking()
    mock.booking.mockResolvedValue({ ...booking, parentProfile: { userId: 'someone-else' } })
    expect((await send()).status).toBe(403)
    expect(mock.account).not.toHaveBeenCalled()
  })
  it('blocks restricted accounts and revokes a stale cached flag', async () => {
    mock.account.mockResolvedValue({ details_submitted: true, charges_enabled: true, payouts_enabled: false })
    expect((await send()).status).toBe(400)
    expect(mock.updateTrainer).toHaveBeenCalledWith({ where: { id: 'trainer' }, data: { stripeOnboardingComplete: false } })
    expect(mock.checkout).not.toHaveBeenCalled()
  })
  it('recovers a stale false readiness flag', async () => {
    const booking = await mock.booking()
    mock.booking.mockResolvedValue({ ...booking, trainerProfile: { ...booking.trainerProfile, stripeOnboardingComplete: false } })
    expect((await send()).status).toBe(200)
    expect(mock.updateTrainer).toHaveBeenCalledWith({ where: { id: 'trainer' }, data: { stripeOnboardingComplete: true } })
  })
  it('fails closed on provider outages without exposing raw details', async () => {
    mock.account.mockRejectedValue(new Error('private provider detail'))
    const response = await send()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private provider detail')
    expect(mock.checkout).not.toHaveBeenCalled()
  })
  it('returns a reconciliation conflict without a payable URL', async () => {
    mock.checkout.mockRejectedValue(new CheckoutConflict('Reconciliation required'))
    const response = await send()
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Reconciliation required' })
  })
})
