import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPackageRequest, PACKAGE_STORAGE_UNAVAILABLE, PackageCheckoutClientError, packageStorageKey, parsePackageRequest, readPackageRequest, requestPackageCheckout, savePackageRequest } from '@/lib/package-checkout-client'

const input = { requestId: '750a6168-89ec-4e57-bdd7-c34806b80c50', packageId: 'catalog', catalogRevision: '2026-10-13T00:00:00.000Z', expectedTotalInCents: 6000 }
const saved = { request: input }, result = { purchaseId: 'purchase', checkoutUrl: 'https://checkout.stripe.com/c/pay/test' }
function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
describe('durable package checkout request', () => {
  it('isolates buyer and catalog keys and preserves the exact request across reads', () => {
    const store = memory(), key = packageStorageKey('buyer', 'catalog')
    expect(key).not.toBe(packageStorageKey('other', 'catalog')); expect(key).not.toBe(packageStorageKey('buyer', 'other'))
    savePackageRequest(store, key, saved)
    expect(parsePackageRequest(readPackageRequest(store, key), 'catalog')).toEqual(saved)
    clearPackageRequest(store, key); expect(readPackageRequest(store, key)).toBeNull()
  })
  it.each(['{', '{}', JSON.stringify({ ...saved, extra: true }), JSON.stringify({ request: { ...input, expectedTotalInCents: 0 } }), PACKAGE_STORAGE_UNAVAILABLE])('blocks corrupt stored state %s', raw => {
    expect(parsePackageRequest(raw, 'catalog')).toBeUndefined()
  })
  it('blocks a saved request for a different package', () => { expect(parsePackageRequest(JSON.stringify(saved), 'other')).toBeUndefined() })
  it('fails closed on unreadable storage', () => {
    const store = { ...memory(), getItem: () => { throw new Error('denied') } }
    expect(readPackageRequest(store, 'key')).toBe(PACKAGE_STORAGE_UNAVAILABLE)
  })
  it('rejects oversized storage before JSON parsing', () => {
    const store = memory(); store.setItem('key', 'x'.repeat(4097))
    expect(readPackageRequest(store, 'key')).toBe(PACKAGE_STORAGE_UNAVAILABLE)
  })
  it('verifies storage writes and removal instead of assuming they worked', () => {
    expect(() => savePackageRequest({ ...memory(), setItem: () => {} }, 'key', saved)).toThrow()
    const store = memory(); store.setItem('key', JSON.stringify(saved))
    expect(() => clearPackageRequest({ ...store, removeItem: () => {} }, 'key')).toThrow()
  })
})
describe('package checkout response handling', () => {
  const fetcher = vi.fn()
  beforeEach(() => { fetcher.mockReset(); vi.stubGlobal('fetch', fetcher) })
  afterEach(() => vi.unstubAllGlobals())
  const respond = (body: unknown, status = 200) => fetcher.mockResolvedValue(new Response(JSON.stringify(body), { status }))
  it('sends the exact reviewed request and validates the response', async () => {
    respond(result); expect(await requestPackageCheckout(input)).toEqual(result)
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify(input), redirect: 'error' })
  })
  it('only allows a fresh quote rejection to reset a request', async () => {
    respond({ error: 'Offer changed', code: 'OFFER_CHANGED' }, 409)
    await expect(requestPackageCheckout(input)).rejects.toMatchObject({ offerChanged: true })
    await expect(requestPackageCheckout({ purchaseId: 'purchase' })).rejects.toMatchObject({ offerChanged: false })
  })
  it.each([400, 401, 403, 404, 409, 429, 503])('keeps the saved request on an ordinary %i error', async status => {
    respond({ error: 'Unable to continue' }, status)
    await expect(requestPackageCheckout(input)).rejects.toMatchObject({ offerChanged: false })
  })
  it.each(['https://evil.test/pay', 'http://checkout.stripe.com/pay', '/pay', 'https://user@checkout.stripe.com/pay'])('rejects unsafe redirect %s', async checkoutUrl => {
    respond({ ...result, checkoutUrl }); await expect(requestPackageCheckout(input)).rejects.toBeInstanceOf(PackageCheckoutClientError)
  })
  it('rejects a response for a different existing purchase', async () => {
    respond(result); await expect(requestPackageCheckout({ purchaseId: 'other' })).rejects.toMatchObject({ offerChanged: false })
  })
  it.each(['drop', 'malformed', 'extra'])('retains uncertain outcome on %s responses', async mode => {
    if (mode === 'drop') fetcher.mockRejectedValue(new Error('private provider detail'))
    if (mode === 'malformed') fetcher.mockResolvedValue(new Response('{', { status: 200 }))
    if (mode === 'extra') respond({ ...result, privateField: 'not safe' })
    await expect(requestPackageCheckout(input)).rejects.toMatchObject({ offerChanged: false })
  })
})
