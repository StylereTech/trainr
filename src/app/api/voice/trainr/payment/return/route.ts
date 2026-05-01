import { NextRequest, NextResponse } from 'next/server'
import { saveOnboardingProgress } from '@/lib/trainr-phone-tools'

export const runtime = 'nodejs'

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const callSid = String(form?.get('CallSid') || '')
  const paymentStatus = String(form?.get('PaymentStatus') || form?.get('Result') || 'returned')

  if (callSid) {
    await saveOnboardingProgress({
      twilioCallSid: callSid,
      status: paymentStatus.toLowerCase().includes('success') ? 'payment_completed' : 'payment_returned',
      onboarding: { sales_status: { payment_status: paymentStatus } },
      transcriptEntry: { role: 'system', event: 'payment_return', paymentStatus, at: new Date().toISOString() },
    })
  }

  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks. I have the payment step marked in your Trainr onboarding record. A Trainr follow-up will be sent with your next steps.</Say>
</Response>`)
}

export async function GET(req: NextRequest) {
  return POST(req)
}
