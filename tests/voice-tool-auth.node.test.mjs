import test from 'node:test'
import assert from 'node:assert/strict'
import { voiceToolAuthStatus } from '../src/lib/voice-tool-auth.ts'

test('voice CRM mutation access fails closed without a configured secret', () => {
  assert.equal(voiceToolAuthStatus(null, ''), 503)
  assert.equal(voiceToolAuthStatus('anything', ''), 503)
})

test('voice CRM mutation access requires an exact secret', () => {
  assert.equal(voiceToolAuthStatus(null, 'configured-secret'), 401)
  assert.equal(voiceToolAuthStatus('wrong-secret', 'configured-secret'), 401)
  assert.equal(voiceToolAuthStatus('configured-secrex', 'configured-secret'), 401)
  assert.equal(voiceToolAuthStatus('configured-secret', 'configured-secret'), 200)
})
