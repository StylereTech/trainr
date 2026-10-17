import { NextRequest, NextResponse } from 'next/server'
import { saveOnboardingProgress } from '@/lib/trainr-phone-tools'
import { readSignedTwilioForm } from '@/lib/twilio-form-auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const signed = await readSignedTwilioForm(req)
  if (!signed.ok) return NextResponse.json({ error: 'Twilio request could not be verified' }, { status: signed.status })
  const callSid = signed.params.CallSid || ''
  const paymentStatus = signed.params.PaymentStatus || signed.params.Result || 'status_callback'

  if (callSid) {
    await saveOnboardingProgress({
      twilioCallSid: callSid,
      onboarding: { sales_status: { payment_status: 'provider_review_required' } },
      transcriptEntry: { role: 'system', event: 'payment_status_callback', paymentStatus, at: new Date().toISOString() },
    })
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
