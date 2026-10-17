import twilio from 'twilio'
import type { NextRequest } from 'next/server'

type SignedForm = { ok: true; params: Record<string, string> } | { ok: false; status: number }

export async function readSignedTwilioForm(req: NextRequest): Promise<SignedForm> {
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!token) return { ok: false, status: 503 }
  if (!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return { ok: false, status: 415 }
  const signature = req.headers.get('x-twilio-signature')
  if (!signature) return { ok: false, status: 403 }
  const body = await req.text()
  if (body.length > 16_384) return { ok: false, status: 413 }
  const form = new URLSearchParams(body)
  const params: Record<string, string> = {}
  for (const [key, value] of form) {
    if (Object.hasOwn(params, key)) return { ok: false, status: 400 }
    params[key] = value
  }
  if (!twilio.validateRequest(token, signature, req.url, params)) return { ok: false, status: 403 }
  return { ok: true, params }
}
