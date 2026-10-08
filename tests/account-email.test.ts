import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { sendAccountEmail } from '@/lib/account-email'

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 're_synthetic')
  vi.stubEnv('EMAIL_FROM', 'Trainr <test@example.invalid>')
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://trainr.cc')
  vi.stubEnv('RESEND_BASE_URL', '')
  vi.stubEnv('NODE_ENV', 'production')
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('bounded Resend account email requests through the installed SDK', () => {
  it.each(['verification', 'reset'] as const)('sends the correct %s link with stable identity and no redirect following', async purpose => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'synthetic-provider-id' }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    expect(await sendAccountEmail('parent@example.test', 'token&with=symbols', purpose)).toBe('accepted')
    const [endpoint, request] = fetcher.mock.calls[0]
    expect(endpoint).toBe('https://api.resend.com/emails')
    expect(request.signal).toBeInstanceOf(AbortSignal)
    expect(request.redirect).toBe('error')
    const payload = JSON.parse(request.body)
    expect(payload.to).toEqual(['parent@example.test'])
    expect(payload.text).toContain(purpose === 'verification' ? '/account/verify-email?token=token%26with%3Dsymbols' : '/auth/reset-password?token=token%26with%3Dsymbols')
    const key = request.headers.get('Idempotency-Key')
    expect(key).toMatch(/^trainr-account-[a-f0-9]{64}$/)
    expect(key).not.toContain('token')
    fetcher.mockResolvedValue(new Response(JSON.stringify({ id: 'synthetic-provider-id' })))
    expect(await sendAccountEmail('parent@example.test', 'token&with=symbols', purpose)).toBe('accepted')
    expect(fetcher.mock.calls[1][1].headers.get('Idempotency-Key')).toBe(key)
  })
  it.each(['', 're_xxx'])('does not transmit with unusable credentials %s', async key => {
    vi.stubEnv('RESEND_API_KEY', key)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await sendAccountEmail('parent@example.test', 'private-token', 'reset')).toBe('unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each(['http://trainr.cc', 'https://user:secret@trainr.cc', 'https://trainr.cc/path', 'https://trainr.cc/?private=secret', 'not-a-url'])('rejects unsafe callback configuration %s', async origin => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', origin)
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    expect(await sendAccountEmail('parent@example.test', 'private-token', 'verification')).toBe('unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects an alternate provider destination and header injection', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher)
    vi.stubEnv('RESEND_BASE_URL', 'https://untrusted.invalid')
    expect(await sendAccountEmail('parent@example.test', 'private-token', 'reset')).toBe('unavailable')
    vi.stubEnv('RESEND_BASE_URL', '')
    vi.stubEnv('EMAIL_FROM', 'sender@example.invalid\r\nBcc: someone@example.invalid')
    expect(await sendAccountEmail('parent@example.test', 'private-token', 'reset')).toBe('unavailable')
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([new Response(JSON.stringify({ message: 'private diagnostics' }), { status: 500 }), new Response('{}'), new Response('not-json')])('fails closed on provider errors or malformed responses', async response => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response))
    const log = vi.spyOn(console, 'error')
    expect(await sendAccountEmail('parent@example.test', 'private-token', 'reset')).toBe('unavailable')
    expect(log).not.toHaveBeenCalled()
  })
  it('handles transport failure without logging credentials or tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private-token')))
    const log = vi.spyOn(console, 'error')
    expect(await sendAccountEmail('parent@example.test', 'private-token', 'reset')).toBe('unavailable')
    expect(log).not.toHaveBeenCalled()
  })
})
