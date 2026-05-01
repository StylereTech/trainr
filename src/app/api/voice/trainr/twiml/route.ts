import { NextRequest, NextResponse } from 'next/server'
import { TRAINR_PHONE_AGENT_NAME } from '@/lib/trainr-phone-agent'
import { saveOnboardingProgress } from '@/lib/trainr-phone-tools'

export const runtime = 'nodejs'

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

function getWsUrl(req: NextRequest) {
  const configured = process.env.TRAINR_VOICE_WS_URL
  if (configured) return configured
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'trainr.cc'
  const proto = host.includes('localhost') ? 'ws' : 'wss'
  return `${proto}://${host}/api/voice/trainr/ws`
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const callSid = String(form?.get('CallSid') || '')
  const from = String(form?.get('From') || '')

  if (callSid || from) {
    await saveOnboardingProgress({
      twilioCallSid: callSid || undefined,
      callerPhone: from || undefined,
      onboarding: {
        call_metadata: {
          twilio_call_sid: callSid,
          recording_consent: true,
          ai_disclosure_given: true,
          sms_consent: true,
        },
        sales_status: { lead_source: 'phone', payment_status: 'not_started' },
      },
      transcriptEntry: { role: 'system', event: 'call_started', at: new Date().toISOString(), from },
    })
  }

  const wsUrl = xmlEscape(getWsUrl(req))
  const greeting = xmlEscape(
    `Thanks for calling Trainr. I'm ${TRAINR_PHONE_AGENT_NAME}, Trainr's AI onboarding specialist. This call may be recorded for quality and onboarding accuracy. I can walk you through Trainr, answer questions, and help get your trainer profile started today. What type of training do you do?`,
  )

  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <ConversationRelay url="${wsUrl}" welcomeGreeting="${greeting}" language="en-US" />
  </Connect>
</Response>`)
}

export async function GET(req: NextRequest) {
  return POST(req)
}
