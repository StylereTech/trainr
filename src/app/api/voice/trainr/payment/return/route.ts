import { NextRequest, NextResponse } from 'next/server'
import { saveOnboardingProgress } from '@/lib/trainr-phone-tools'
import { readSignedTwilioForm } from '@/lib/twilio-form-auth'

export const runtime = 'nodejs'

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

export async function POST(req: NextRequest) {
  const signed = await readSignedTwilioForm(req)
  if (!signed.ok) return new NextResponse('Twilio request could not be verified', { status: signed.status })
  const callSid = signed.params.CallSid || ''
  const paymentStatus = signed.params.PaymentStatus || signed.params.Result || 'returned'

  if (callSid) {
    await saveOnboardingProgress({
      twilioCallSid: callSid,
      status: 'payment_returned',
      onboarding: { sales_status: { payment_status: 'provider_review_required' } },
      transcriptEntry: { role: 'system', event: 'payment_return', paymentStatus, at: new Date().toISOString() },
    })
  }

  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks. I have the payment step marked in your Trainr onboarding record. A Trainr follow-up will be sent with your next steps.</Say>
</Response>`)
}

export async function GET() {
  return new NextResponse('Method not allowed', { status: 405 })
}
