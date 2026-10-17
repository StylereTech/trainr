import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Stripe from 'stripe'

const platformSecret = 'whsec_synthetic_mode_platform'
const connectSecret = 'whsec_synthetic_mode_connect'
const mocks = vi.hoisted(() => ({ signature: '', readiness: vi.fn(), payment: vi.fn(), refund: vi.fn(),
  financial: vi.fn(), packageCheckout: vi.fn(), packageSuccess: vi.fn() }))
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'stripe-signature': mocks.signature }) }))
vi.mock('@/lib/connect-readiness', () => ({ refreshConnectReadiness: mocks.readiness }))
vi.mock('@/lib/stripe-payment-events', () => ({ applyPaymentEvidence: mocks.payment, PaymentEventConflict: class extends Error {} }))
vi.mock('@/lib/refund-reconciliation', () => ({ reconcileRefundEvent: mocks.refund, RefundReconciliationError: class extends Error {} }))
vi.mock('@/lib/stripe-settlement', () => ({ SettlementConflict: class extends Error {} }))
vi.mock('@/lib/stripe-financial-events', () => ({ reconcileFinancialEvent: mocks.financial }))
vi.mock('@/lib/package-settlement', () => ({ reconcilePackageCheckout: mocks.packageCheckout, reconcilePackagePaymentSuccess: mocks.packageSuccess }))
vi.mock('@/lib/package-purchases', () => ({ PackagePurchaseError: class extends Error {} }))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', platformSecret)
  vi.stubEnv('STRIPE_CONNECT_WEBHOOK_SECRET', connectSecret)
})
afterEach(() => vi.unstubAllEnvs())

const handlers = () => [mocks.readiness, mocks.payment, mocks.refund, mocks.financial, mocks.packageCheckout, mocks.packageSuccess]
const cases = [
  { type: 'checkout.session.completed', handler: 'payment', object: { id: 'cs_synthetic', payment_status: 'paid', payment_intent: 'pi_synthetic', amount_total: 6000, currency: 'usd', metadata: { bookingId: 'booking' } } },
  { type: 'payment_intent.payment_failed', handler: 'payment', object: { id: 'pi_synthetic', amount: 6000, currency: 'usd', metadata: { bookingId: 'booking' } } },
  { type: 'refund.updated', handler: 'refund', object: { id: 're_synthetic', charge: 'ch_synthetic' } },
  { type: 'transfer.updated', handler: 'financial', object: { id: 'tr_synthetic' } },
  { type: 'checkout.session.completed', handler: 'packageCheckout', object: { id: 'cs_package', payment_status: 'paid', metadata: { paymentKind: 'package', packagePurchaseId: 'purchase', packageCheckoutAttemptId: 'attempt' } } },
  { type: 'payment_intent.succeeded', handler: 'packageSuccess', object: { id: 'pi_package', metadata: { paymentKind: 'package', packagePurchaseId: 'purchase', packageCheckoutAttemptId: 'attempt' } } },
  { type: 'account.updated', handler: 'readiness', object: { id: 'acct_synthetic' } },
] as const

async function send(event: object, signingSecret = platformSecret) {
  const body = JSON.stringify(event)
  mocks.signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: signingSecret })
  const { POST } = await import('@/app/api/payments/webhook/route')
  return POST(new Request('http://localhost/api/payments/webhook', { method: 'POST', body }) as any)
}

describe.each(['sk_test_', 'sk_live_', 'rk_test_', 'rk_live_'])('signed webhook isolation for %s', prefix => {
  beforeEach(() => vi.stubEnv('STRIPE_SECRET_KEY', prefix + 'synthetic_no_network'))
  const runtimeLive = prefix.includes('_live_')

  it.each(cases)('ignores opposite-mode $type before $handler', async entry => {
    const event = { id: 'evt_mode', type: entry.type, livemode: !runtimeLive, data: { object: entry.object } }
    const response = await send(event)
    for (const handler of handlers()) expect(handler).not.toHaveBeenCalled()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, ignored: 'event_mode_mismatch' })
  })

  it.each(cases)('retains matching-mode $type dispatch to $handler', async entry => {
    const response = await send({ id: 'evt_mode', type: entry.type, livemode: runtimeLive, data: { object: entry.object } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true })
    expect(mocks[entry.handler]).toHaveBeenCalledTimes(1)
    for (const handler of handlers().filter(handler => handler !== mocks[entry.handler])) expect(handler).not.toHaveBeenCalled()
  })

  it.each([true, false])('checks the separate Connect signature before filtering; matching=%s', async matching => {
    const response = await send({ id: 'evt_connect_mode', type: 'account.updated', account: 'acct_synthetic',
      livemode: matching ? runtimeLive : !runtimeLive, data: { object: { id: 'acct_synthetic' } } }, connectSecret)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(matching ? { received: true } : { received: true, ignored: 'event_mode_mismatch' })
    expect(mocks.readiness).toHaveBeenCalledTimes(matching ? 1 : 0)
  })

  it.each([undefined, null, 'false', 0])('rejects a missing or non-boolean event mode: %s', async livemode => {
    expect((await send({ id: 'evt_invalid_mode', type: 'account.updated', livemode, data: { object: { id: 'acct_synthetic' } } })).status).toBe(400)
    for (const handler of handlers()) expect(handler).not.toHaveBeenCalled()
  })

  it('does not acknowledge an untrusted opposite-mode event', async () => {
    expect((await send({ id: 'evt_untrusted', type: 'account.updated', livemode: !runtimeLive, data: { object: { id: 'acct_synthetic' } } }, 'whsec_synthetic_untrusted')).status).toBe(400)
    for (const handler of handlers()) expect(handler).not.toHaveBeenCalled()
  })

  it('rejects a signed body whose mode was tampered with', async () => {
    const event = { id: 'evt_tampered', type: 'account.updated', livemode: runtimeLive, data: { object: { id: 'acct_synthetic' } } }
    mocks.signature = Stripe.webhooks.generateTestHeaderString({ payload: JSON.stringify(event), secret: platformSecret })
    const { POST } = await import('@/app/api/payments/webhook/route')
    const response = await POST(new Request('http://localhost/api/payments/webhook', {
      method: 'POST', body: JSON.stringify({ ...event, livemode: !runtimeLive }),
    }) as any)
    expect(response.status).toBe(400)
    for (const handler of handlers()) expect(handler).not.toHaveBeenCalled()
  })

  it('does not bypass Connect account identity checks for opposite-mode events', async () => {
    expect((await send({ id: 'evt_bad_scope', type: 'account.updated', account: 'acct_other', livemode: !runtimeLive,
      data: { object: { id: 'acct_synthetic' } } }, connectSecret)).status).toBe(400)
    for (const handler of handlers()) expect(handler).not.toHaveBeenCalled()
  })
})

it('rejects a signed event when the runtime key mode cannot be determined', async () => {
  vi.stubEnv('STRIPE_SECRET_KEY', 'synthetic_unknown_key_format')
  const response = await send({ id: 'evt_unknown_runtime', type: 'account.updated', livemode: false,
    data: { object: { id: 'acct_synthetic' } } })
  expect(response.status).toBe(400)
  for (const handler of handlers()) expect(handler).not.toHaveBeenCalled()
})
