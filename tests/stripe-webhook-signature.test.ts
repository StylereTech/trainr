import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const mock = vi.hoisted(() => ({ signature: '', transaction: vi.fn(), refund: vi.fn() }))
vi.mock('@/lib/refund-reconciliation', () => ({
  reconcileRefundEvent: mock.refund,
  RefundReconciliationError: class extends Error { constructor(message: string, public status = 409) { super(message) } },
}))
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
  it.each(['refund.created', 'refund.updated', 'refund.failed', 'charge.refund.updated', 'charge.refunded'])('reconciles current provider truth for a signed %s event', async type => {
    const body = JSON.stringify({ id: 'evt_refund', type, data: { object: type === 'charge.refunded' ? { id: 'ch_fixture', amount_refunded: 6000 } : { id: 're_fixture', charge: 'ch_fixture', amount: 6000, status: 'succeeded' } } })
    mock.signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret })
    expect((await send(body)).status).toBe(200)
    expect(mock.refund).toHaveBeenCalledWith('ch_fixture', ...(type === 'charge.refunded' ? [] : ['re_fixture']))
    expect(mock.transaction).not.toHaveBeenCalled()
  })

  it('does not acknowledge a signed refund when provider reconciliation fails', async () => {
    const body = JSON.stringify({ id: 'evt_refund', type: 'refund.updated', data: { object: { id: 're_fixture', charge: 'ch_fixture' } } })
    mock.signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret })
    mock.refund.mockRejectedValueOnce(new Error('private provider details'))
    const response = await send(body)
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('private provider')
  })

  it('ignores mirrored connected-account refund events', async () => {
    const body = JSON.stringify({ id: 'evt_refund', account: 'acct_fixture', type: 'refund.updated', data: { object: { id: 're_fixture', charge: 'ch_fixture' } } })
    mock.signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret })
    expect((await send(body)).status).toBe(200)
    expect(mock.refund).not.toHaveBeenCalled()
  })
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
