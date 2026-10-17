import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const config = createRequire(import.meta.url)('../next.config.js')

describe('HTTP browser protections', () => {
  it('covers every application and API path', async () => {
    expect(typeof config.headers).toBe('function')
    expect(await config.headers()).toEqual([{ source: '/:path*', headers: expect.any(Array) }])
  })
  it('denies framing and sniffing without restricting outgoing Stripe content', async () => {
    const rules = await config.headers()
    const headers = Object.fromEntries(rules[0].headers.map(({ key, value }: { key: string; value: string }) => [key.toLowerCase(), value]))
    expect(headers['content-security-policy']).toBe("frame-ancestors 'none'")
    expect(headers['x-frame-options']).toBe('DENY')
    expect(headers['x-content-type-options']).toBe('nosniff')
  })
  it('omits referrer URLs, including same-origin authentication query strings', async () => {
    const rules = await config.headers()
    expect(rules[0].headers).toContainEqual({ key: 'Referrer-Policy', value: 'no-referrer' })
  })
})
