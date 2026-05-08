import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const TRAINR_PHONE_AGENT_NAME = 'Jordan'

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xml(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  })
}

function getWsUrl() {
  return process.env.TRAINR_VOICE_WS_URL || ''
}

export async function POST(req: NextRequest) {
  const configuredWsUrl = getWsUrl()
  if (!configuredWsUrl) {
    return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thanks for calling Trainr. Jordan, our AI onboarding specialist, is being connected to the phone line now. Please visit trainr.cc or try again shortly.</Say>
  <Hangup />
</Response>`)
  }

  const wsUrl = xmlEscape(configuredWsUrl)
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
