import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const platformSecret = 'whsec_synthetic_platform_scope'
const connectSecret = 'whsec_synthetic_connect_scope'
const mock = vi.hoisted(() => ({ signature: '', updateMany: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'stripe-signature': mock.signature }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { trainerProfile: { updateMany: mock.updateMany } } }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.updateMany.mockResolvedValue({ count: 1 })
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_no_network')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', platformSecret)
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', connectSecret)
})
afterEach(() => vi.unstubAllEnvs())

async function verify(event: object, secret = connectSecret) {
  const payload = JSON.stringify(event)
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret })
  const { verifyWebhookSignature } = await import('@/lib/stripe')
  return verifyWebhookSignature(payload, signature)
}

describe('separate platform and Connect webhook signing secrets', () => {
  const connectedEvent = {
    id: 'evt_synthetic_connect', type: 'account.updated', account: 'acct_synthetic',
    data: { object: { id: 'acct_synthetic', charges_enabled: true, payouts_enabled: true } },
  }

  it('accepts a connected-account event signed by its separate destination', async () => {
    expect(await verify(connectedEvent)).toEqual(connectedEvent)
  })

  it('keeps the existing platform signing secret working', async () => {
    const event = { id: 'evt_platform', type: 'payment_intent.succeeded', data: { object: {} } }
    expect(await verify(event, platformSecret)).toEqual(event)
  })

  it('rejects a platform payment signed with the Connect destination secret', async () => {
    await expect(verify({ type: 'payment_intent.succeeded', data: { object: {} } })).rejects.toThrow()
  })

  it('rejects mismatched Connect account identity', async () => {
    await expect(verify({ ...connectedEvent, account: 'acct_other' })).rejects.toThrow()
  })

  it('rejects an unrelated destination signing secret', async () => {
    await expect(verify(connectedEvent, 'whsec_synthetic_other')).rejects.toThrow()
  })

  it('does not accept an absent Connect signing secret', async () => {
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', '')
    await expect(verify(connectedEvent)).rejects.toThrow()
  })

  it('rejects a modified body with the separate Connect signature', async () => {
    const payload = JSON.stringify(connectedEvent)
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: connectSecret })
    const { verifyWebhookSignature } = await import('@/lib/stripe')
    await expect(verifyWebhookSignature(payload.replace('true', 'false'), signature)).rejects.toThrow()
  })

  it('rejects an expired Connect signature', async () => {
    const payload = JSON.stringify(connectedEvent)
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: connectSecret, timestamp: Math.floor(Date.now() / 1000) - 600 })
    const { verifyWebhookSignature } = await import('@/lib/stripe')
    await expect(verifyWebhookSignature(payload, signature)).rejects.toThrow()
  })

  async function send(event: object) {
    const body = JSON.stringify(event)
    mock.signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: connectSecret })
    const { POST } = await import('@/app/api/payments/webhook/route')
    return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body }) as any)
  }

  it('persists trainer readiness from the separately signed Connect webhook', async () => {
    const event = { ...connectedEvent, data: { object: { ...connectedEvent.data.object, details_submitted: true } } }
    expect((await send(event)).status).toBe(200)
    expect(mock.updateMany).toHaveBeenCalledWith({
      where: { stripeAccountId: 'acct_synthetic' }, data: { stripeOnboardingComplete: true },
    })
  })

  it('does not acknowledge a Connect update that failed persistence', async () => {
    mock.updateMany.mockRejectedValueOnce(new Error('synthetic database failure'))
    expect((await send(connectedEvent)).status).toBe(503)
  })

  it('rejects mismatched account scope before changing trainer readiness', async () => {
    expect((await send({ ...connectedEvent, account: 'acct_other' })).status).toBe(400)
    expect(mock.updateMany).not.toHaveBeenCalled()
  })

  it('reports Connect webhook configuration independently of payment configuration', async () => {
    const { stripeRuntimeStatus } = await import('@/lib/stripe')
    expect(stripeRuntimeStatus()).toMatchObject({ webhookConfigured: true, connectWebhookConfigured: true })
  })
})
