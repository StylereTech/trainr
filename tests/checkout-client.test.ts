import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkoutResponseSchema, requestCheckout } from '@/lib/checkout-client'

const checkoutUrl = 'https://checkout.stripe.com/c/pay/cs_test_synthetic#token'
const fetcher = vi.fn()

beforeEach(() => { vi.stubGlobal('fetch', fetcher); fetcher.mockReset() })
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('parent checkout response and recovery', () => {
  it.each([checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_live_synthetic'])('accepts the configured Stripe-hosted destination %s', value => {
    expect(checkoutResponseSchema.parse({ checkoutUrl: value }).checkoutUrl).toBe(value)
  })
  it.each(['javascript:alert(1)', '//checkout.stripe.com/pay', '/parent/dashboard', 'http://checkout.stripe.com/pay',
    'https://checkout.stripe.com.attacker.test/pay', 'https://checkout.stripe.com@attacker.test/pay',
    'https://user:password@checkout.stripe.com/pay', 'https://checkout.stripe.com:444/pay', 'https://dashboard.stripe.com/pay',
    'https://untrusted-checkout.example.test/pay', null, {}, 123, ''])('rejects unsafe or malformed checkout URL %j', value => {
    expect(checkoutResponseSchema.safeParse({ checkoutUrl: value }).success).toBe(false)
  })
  it('makes exactly one bounded POST for the saved booking and preserves its checkout URL', async () => {
    const signal = new AbortController().signal
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(signal)
    fetcher.mockResolvedValue(new Response(JSON.stringify({ checkoutUrl })))
    expect(await requestCheckout('saved-booking')).toBe(checkoutUrl)
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/payments/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId: 'saved-booking' }), signal, redirect: 'error',
    })
    expect(timeout).toHaveBeenCalledExactlyOnceWith(15000)
  })
  it.each([400, 401, 403, 404, 409, 429, 503])('retains a validated server error for HTTP %i without retrying', async status => {
    fetcher.mockResolvedValue(new Response(JSON.stringify({ error: '  Payment is already processing.  ' }), { status }))
    await expect(requestCheckout('saved-booking')).rejects.toThrow('Payment is already processing.')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it.each([null, {}, { error: {} }, { error: [] }, { error: 123 }, { error: '' }, { error: 'x'.repeat(501) }])('replaces malformed errors with safe booking guidance: %j', async data => {
    fetcher.mockResolvedValue(new Response(JSON.stringify(data), { status: 503 }))
    await expect(requestCheckout('saved-booking')).rejects.toThrow('Check the saved booking and payment status')
  })
  it.each([{}, null, { checkoutUrl: 'https://untrusted-checkout.example.test/pay' }])('rejects a successful but unusable response %j', async data => {
    fetcher.mockResolvedValue(new Response(JSON.stringify(data)))
    await expect(requestCheckout('saved-booking')).rejects.toThrow('Check the saved booking and payment status')
  })
  it('handles a non-JSON response without treating checkout as payment success', async () => {
    fetcher.mockResolvedValue(new Response('<html>Unavailable</html>'))
    await expect(requestCheckout('saved-booking')).rejects.toThrow('Check the saved booking and payment status')
  })
  it.each([new TypeError('Network failure'), new DOMException('Expired', 'TimeoutError')])('handles transport failure without another POST: %s', async error => {
    fetcher.mockRejectedValue(error)
    await expect(requestCheckout('saved-booking')).rejects.toThrow('Check the saved booking and payment status')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
