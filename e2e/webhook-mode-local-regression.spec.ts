import { test, expect } from '@playwright/test'
import Stripe from 'stripe'

test.skip(process.env.LOCAL_WEBHOOK_MODE_TESTS !== '1', 'Requires the owned local fake-key webhook runtime')
test.beforeAll(() => {
  if (process.env.BASE_URL !== 'http://127.0.0.1:3108') throw new Error('Webhook mode tests require the exact owned loopback runtime')
})

const platformSecret = 'whsec_local_headers_only_not_real'
const connectSecret = 'whsec_local_mode_connect_only'
const events = [
  { type: 'checkout.session.completed', data: { object: { id: 'cs_local_mode', payment_status: 'paid', metadata: { bookingId: 'synthetic-mode-probe' } } } },
  { type: 'payment_intent.payment_failed', data: { object: { id: 'pi_local_mode', metadata: { bookingId: 'synthetic-mode-probe' } } } },
  { type: 'refund.updated', data: { object: { id: 're_local_mode', charge: 'ch_local_mode' } } },
  { type: 'transfer.updated', data: { object: { id: 'tr_local_mode' } } },
  { type: 'account.updated', data: { object: { id: 'acct_local_mode' } } },
]

for (const event of events) {
  test(`built webhook ignores live ${event.type} on the fake test runtime`, async ({ request }) => {
    const data = JSON.stringify({ id: 'evt_local_mode', livemode: true, ...event })
    const response = await request.post('/api/payments/webhook', { data,
      headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: data, secret: platformSecret }) } })
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ received: true, ignored: 'event_mode_mismatch' })
  })
}

test('built webhook filters a separately signed opposite-mode Connect event', async ({ request }) => {
  const data = JSON.stringify({ id: 'evt_local_connect_mode', type: 'account.updated', account: 'acct_local_mode', livemode: true,
    data: { object: { id: 'acct_local_mode' } } })
  const response = await request.post('/api/payments/webhook', { data,
    headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: data, secret: connectSecret }) } })
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ received: true, ignored: 'event_mode_mismatch' })
})

test('built webhook accepts matching-mode signed unhandled events', async ({ request }) => {
  const data = JSON.stringify({ id: 'evt_local_matching', type: 'synthetic.unhandled', livemode: false, data: { object: {} } })
  const response = await request.post('/api/payments/webhook', { data,
    headers: { 'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: data, secret: platformSecret }) } })
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ received: true })
})

for (const kind of ['missing-mode', 'tampered-mode', 'unsigned'] as const) {
  test(`built webhook rejects ${kind}`, async ({ request }) => {
    const event = { id: 'evt_local_invalid', type: 'account.updated', data: { object: { id: 'acct_local_mode' } } }
    const original = JSON.stringify(kind === 'missing-mode' ? event : { ...event, livemode: false })
    const data = kind === 'tampered-mode' ? JSON.stringify({ ...event, livemode: true }) : original
    const response = await request.post('/api/payments/webhook', { data, headers: kind === 'unsigned' ? {} : {
      'stripe-signature': Stripe.webhooks.generateTestHeaderString({ payload: original, secret: platformSecret }),
    } })
    expect(response.status()).toBe(400)
  })
}
