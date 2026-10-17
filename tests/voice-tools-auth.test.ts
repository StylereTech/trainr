import { afterEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/voice/trainr/tools/route'

const mock = vi.hoisted(() => ({ save: vi.fn(), payment: vi.fn() }))
vi.mock('@/lib/trainr-phone-tools', () => ({
  lookupTrainerByPhone: vi.fn(), saveOnboardingProgress: mock.save,
  createTrainerProfileDraft: vi.fn(), startSecurePayment: mock.payment,
}))

const request = (secret?: string) => new NextRequest('https://trainr.test/api/voice/trainr/tools', {
  method: 'POST', headers: secret ? { 'x-trainr-voice-secret': secret } : {},
  body: JSON.stringify({ tool: 'save_onboarding_progress', arguments: { callerPhone: '+15551234567' } }),
})

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks() })

it('fails closed when the CRM voice-tool secret is not configured', async () => {
  vi.stubEnv('TRAINR_VOICE_TOOL_SECRET', '')
  expect((await POST(request())).status).toBe(503)
  expect(mock.save).not.toHaveBeenCalled()
})

it('rejects missing and incorrect secrets before touching trainer leads', async () => {
  vi.stubEnv('TRAINR_VOICE_TOOL_SECRET', 'configured-secret')
  expect((await POST(request())).status).toBe(401)
  expect((await POST(request('wrong-secret'))).status).toBe(401)
  expect(mock.save).not.toHaveBeenCalled()
})

it('allows only the matching service secret', async () => {
  vi.stubEnv('TRAINR_VOICE_TOOL_SECRET', 'configured-secret')
  mock.save.mockResolvedValue({ id: 'lead' })
  expect((await POST(request('configured-secret'))).status).toBe(200)
  expect(mock.save).toHaveBeenCalledTimes(1)
})
