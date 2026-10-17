import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import twilio from 'twilio'
import { POST as toolPost } from '@/app/api/voice/trainr/tools/route'
import { POST as twimlPost, GET as twimlGet } from '@/app/api/voice/trainr/payment/twiml/route'
import { POST as returnPost, GET as returnGet } from '@/app/api/voice/trainr/payment/return/route'
import { POST as statusPost, GET as statusGet } from '@/app/api/voice/trainr/payment/status/route'

const mock = vi.hoisted(() => ({ save: vi.fn() }))
vi.mock('@/lib/trainr-phone-tools', () => ({
  saveOnboardingProgress: mock.save,
  createTrainerProfileDraft: vi.fn(), lookupTrainerByPhone: vi.fn(),
}))

const callSid = `CA${'a'.repeat(32)}`
const token = 'unit-twilio-token'
const signed = (path: string, params: Record<string, string> = { CallSid: callSid }, signature = true) => {
  const url = `https://trainr.test${path}`
  return new NextRequest(url, { method: 'POST', headers: {
    'content-type': 'application/x-www-form-urlencoded',
    ...(signature ? { 'x-twilio-signature': twilio.getExpectedTwilioSignature(token, url, params) } : {}),
  }, body: new URLSearchParams(params).toString() })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('TWILIO_AUTH_TOKEN', token)
  vi.stubEnv('TRAINR_VOICE_TOOL_SECRET', 'unit-tool-secret')
})
afterEach(() => vi.unstubAllEnvs())

it('keeps CRM voice tools closed when the shared secret is missing or wrong', async () => {
  const body = { tool: 'start_secure_payment', arguments: { leadId: 'lead' } }
  vi.stubEnv('TRAINR_VOICE_TOOL_SECRET', '')
  expect((await toolPost(new NextRequest('https://trainr.test/api/voice/trainr/tools', { method: 'POST', body: JSON.stringify(body) }))).status).toBe(503)
  vi.stubEnv('TRAINR_VOICE_TOOL_SECRET', 'unit-tool-secret')
  expect((await toolPost(new NextRequest('https://trainr.test/api/voice/trainr/tools', { method: 'POST', body: JSON.stringify(body) }))).status).toBe(401)
})

it('keeps trainer phone checkout paused even with a valid tool secret', async () => {
  const post = (args: unknown) => toolPost(new NextRequest('https://trainr.test/api/voice/trainr/tools', { method: 'POST',
    headers: { 'x-trainr-voice-secret': 'unit-tool-secret' },
    body: JSON.stringify({ tool: 'start_secure_payment', arguments: args }),
  }))
  expect((await post({ leadId: 'lead', plan: 'founding_listing', amountInCents: 1 })).status).toBe(400)
  expect((await post({ leadId: 'lead', plan: 'other' })).status).toBe(400)
  const response = await post({ leadId: 'lead', plan: 'founding_package' })
  expect(response.status).toBe(503)
  expect(await response.text()).toContain('paused pending provider reconciliation')
})

it('requires signed Twilio form requests and never emits a Pay instruction', async () => {
  expect((await twimlPost(signed('/api/voice/trainr/payment/twiml', { CallSid: callSid }, false))).status).toBe(403)
  const listed = await twimlPost(signed('/api/voice/trainr/payment/twiml?amount=0.01'))
  expect(listed.status).toBe(200)
  expect(await listed.text()).not.toContain('<Pay')
  const packagePlan = await twimlPost(signed('/api/voice/trainr/payment/twiml?plan=founding_package&amount=0.01'))
  const packageXml = await packagePlan.text()
  expect(packageXml).toContain('Phone payments are temporarily unavailable')
  expect(packageXml).not.toContain('<Pay')
  expect((await twimlGet()).status).toBe(405)
})

it('never records an unsigned or caller-claimed phone success as a paid receipt', async () => {
  const params = { CallSid: callSid, PaymentStatus: 'success', CardNumber: 'private-data' }
  expect((await returnPost(signed('/api/voice/trainr/payment/return', params, false))).status).toBe(403)
  expect((await statusPost(signed('/api/voice/trainr/payment/status', params, false))).status).toBe(403)
  expect(mock.save).not.toHaveBeenCalled()
  expect((await returnPost(signed('/api/voice/trainr/payment/return', params))).status).toBe(200)
  expect(mock.save).toHaveBeenCalledWith(expect.objectContaining({
    status: 'payment_returned', onboarding: { sales_status: { payment_status: 'provider_review_required' } },
  }))
  expect((await statusPost(signed('/api/voice/trainr/payment/status', params))).status).toBe(200)
  expect(JSON.stringify(mock.save.mock.calls)).not.toContain('private-data')
  expect((await returnGet()).status).toBe(405)
  expect((await statusGet()).status).toBe(405)
})
