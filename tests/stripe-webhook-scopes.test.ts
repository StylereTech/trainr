import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const platformSecret = 'whsec_synthetic_platform_scope'
const connectSecret = 'whsec_synthetic_connect_scope'
const mock = vi.hoisted(() => ({ signature: '', updateMany: vi.fn(), findFirst: vi.fn(), lock: vi.fn(), retrieve: vi.fn() }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'stripe-signature': mock.signature }),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { trainerProfile: { updateMany: mock.updateMany },
  $transaction: async (fn: (tx: unknown) => unknown) => fn({ $queryRaw: mock.lock, trainerProfile: { findFirst: mock.findFirst, updateMany: mock.updateMany } }) } }))

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  mock.updateMany.mockResolvedValue({ count: 1 })
  mock.findFirst.mockResolvedValue({ id: 'trainer' })
  mock.retrieve.mockResolvedValue({ id: 'acct_synthetic', details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: 'active' } })
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_synthetic_no_network')
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', platformSecret)
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', connectSecret)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

async function verify(event: object, secret = connectSecret) {
  const payload = JSON.stringify(event)
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret })
  const { verifyWebhookSignature } = await import('@/lib/stripe')
  return verifyWebhookSignature(payload, signature)
}

describe('separate platform and Connect webhook signing secrets', () => {
  const connectedEvent = {
    id: 'evt_synthetic_connect', type: 'account.updated', account: 'acct_synthetic', livemode: false,
    data: { object: { id: 'acct_synthetic', charges_enabled: true, payouts_enabled: true } },
  }

  it('accepts a connected-account event signed by its separate destination', async () => {
    expect(await verify(connectedEvent)).toEqual(connectedEvent)
  })

  it('rejects a connected-account event signed by the platform destination', async () => {
    await expect(verify(connectedEvent, platformSecret)).rejects.toThrow()
  })

  it('fails closed when both destination secrets are configured identically', async () => {
    vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', platformSecret)
    await expect(verify(connectedEvent, platformSecret)).rejects.toThrow('share a signing secret')
  })

  it('keeps the existing platform signing secret working', async () => {
    const event = { id: 'evt_platform', type: 'payment_intent.succeeded', livemode: false, data: { object: {} } }
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
    const { stripe } = await import('@/lib/stripe')
    vi.spyOn(stripe.accounts, 'retrieve').mockImplementation(mock.retrieve)
    const { POST } = await import('@/app/api/payments/webhook/route')
    return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body }) as any)
  }

  it.each([true, false])('uses current readiness %s instead of the opposite delayed event snapshot', async ready => {
    mock.retrieve.mockResolvedValue({ id: 'acct_synthetic', details_submitted: true, charges_enabled: ready, payouts_enabled: ready, capabilities: { transfers: 'active' } })
    expect((await send({ ...connectedEvent, data: { object: { id: 'acct_synthetic', details_submitted: true, charges_enabled: !ready, payouts_enabled: !ready } } })).status).toBe(200)
    expect(mock.retrieve).toHaveBeenCalledWith('acct_synthetic', {}, { timeout: 4000, maxNetworkRetries: 0 })
    expect(mock.updateMany).toHaveBeenCalledWith({ where: { stripeAccountId: 'acct_synthetic' }, data: { stripeOnboardingComplete: ready } })
  })
  it('does not save a stale event or acknowledge a failed current lookup', async () => {
    mock.retrieve.mockRejectedValue(new Error('synthetic provider outage'))
    expect((await send(connectedEvent)).status).toBe(503)
    expect(mock.updateMany).not.toHaveBeenCalled()
  })
  it('revokes readiness when current transfer capability is inactive despite an active event snapshot', async () => {
    mock.retrieve.mockResolvedValue({ id: 'acct_synthetic', details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { transfers: 'inactive' } })
    expect((await send({ ...connectedEvent, data: { object: { ...connectedEvent.data.object, capabilities: { transfers: 'active' } } } })).status).toBe(200)
    expect(mock.updateMany).toHaveBeenCalledWith({ where: { stripeAccountId: 'acct_synthetic' }, data: { stripeOnboardingComplete: false } })
  })
  it('ignores accounts not linked to a TRAINR trainer without a provider lookup', async () => {
    mock.findFirst.mockResolvedValue(null)
    expect((await send(connectedEvent)).status).toBe(200)
    expect(mock.retrieve).not.toHaveBeenCalled()
    expect(mock.updateMany).not.toHaveBeenCalled()
  })

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
