import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const mock = vi.hoisted(() => ({ signature: '', transaction: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers(mock.signature ? { 'stripe-signature': mock.signature } : {}),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))

const secret = 'whsec_synthetic_signature_test_only'
const payload = JSON.stringify({
  id: 'evt_synthetic', type: 'checkout.session.completed',
  data: { object: { payment_status: 'unpaid', metadata: { bookingId: 'booking' } } },
})

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_no_network')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', secret)
  mock.signature = Stripe.webhooks.generateTestHeaderString({ payload, secret })
})
afterEach(() => vi.unstubAllEnvs())

async function send(body = payload) {
  const { POST } = await import('@/app/api/payments/webhook/route')
  return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body }) as any)
}

describe('webhook route with real Stripe SDK signature verification', () => {
  it('accepts an authentic synthetic signature without contacting Stripe or crediting an unpaid event', async () => {
    expect((await send()).status).toBe(200)
    expect(mock.transaction).not.toHaveBeenCalled()
  })

  it('rejects a modified raw body', async () => {
    expect((await send(payload.replace('unpaid', 'paid'))).status).toBe(400)
    expect(mock.transaction).not.toHaveBeenCalled()
  })

  it('rejects a signature from another endpoint secret', async () => {
    mock.signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_other_synthetic' })
    expect((await send()).status).toBe(400)
    expect(mock.transaction).not.toHaveBeenCalled()
  })

  it('rejects stale signatures beyond the SDK replay tolerance', async () => {
    mock.signature = Stripe.webhooks.generateTestHeaderString({ payload, secret, timestamp: Math.floor(Date.now() / 1000) - 600 })
    expect((await send()).status).toBe(400)
  })

  it('rejects a missing signature', async () => {
    mock.signature = ''
    expect((await send()).status).toBe(400)
  })

  it('returns retryable failure without acknowledging an unpersisted paid event', async () => {
    const paidPayload = payload.replace('unpaid', 'paid')
    mock.signature = Stripe.webhooks.generateTestHeaderString({ payload: paidPayload, secret })
    mock.transaction.mockRejectedValueOnce(new Error('private database connection details'))
    const response = await send(paidPayload)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private database')
  })
})
