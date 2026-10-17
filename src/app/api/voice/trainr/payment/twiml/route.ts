import { NextRequest, NextResponse } from 'next/server'
import { readSignedTwilioForm } from '@/lib/twilio-form-auth'

export const runtime = 'nodejs'

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

export async function POST(req: NextRequest) {
  const signed = await readSignedTwilioForm(req)
  if (!signed.ok) return new NextResponse('Twilio request could not be verified', { status: signed.status })
  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Phone payments are temporarily unavailable. Trainr support will follow up with an approved online payment option. Please do not say card details out loud.</Say>
</Response>`)
}

export async function GET() {
  return new NextResponse('Method not allowed', { status: 405 })
}
