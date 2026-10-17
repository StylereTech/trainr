import { timingSafeEqual } from 'node:crypto'

export function voiceToolAuthStatus(supplied: string | null, secret = process.env.TRAINR_VOICE_TOOL_SECRET): 200 | 401 | 503 {
  if (!secret) return 503
  if (!supplied) return 401
  const actual = Buffer.from(supplied), expected = Buffer.from(secret)
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? 200 : 401
}
