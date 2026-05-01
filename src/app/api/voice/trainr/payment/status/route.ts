import { NextRequest, NextResponse } from 'next/server'
import { saveOnboardingProgress } from '@/lib/trainr-phone-tools'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const callSid = String(form?.get('CallSid') || '')
  const payload = Object.fromEntries(Array.from(form?.entries() || []).map(([key, value]) => [key, String(value)]))

  if (callSid) {
    await saveOnboardingProgress({
      twilioCallSid: callSid,
      onboarding: { sales_status: { payment_status: payload.PaymentStatus || payload.Result || 'status_callback' } },
      transcriptEntry: { role: 'system', event: 'payment_status_callback', payload, at: new Date().toISOString() },
    })
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest) {
  return POST(req)
}
