import { NextRequest, NextResponse } from 'next/server'
import { readSignedTwilioForm } from '@/lib/twilio-form-auth'

export const runtime = 'nodejs'

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

export async function POST(req: NextRequest) {
  const signed = await readSignedTwilioForm(req)
  if (!signed.ok) return new NextResponse('Twilio request could not be verified', { status: signed.status })
  const plan = signed.params.plan || req.nextUrl.searchParams.get('plan') || 'founding_listing'
  if (plan !== 'founding_listing' && plan !== 'founding_package') return new NextResponse('Unsupported trainer onboarding plan', { status: 400 })
  const amount = plan === 'founding_package' ? '299.00' : '99.00'
  const connector = process.env.TRAINR_TWILIO_PAY_CONNECTOR || 'Trainr_Stripe'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://trainr.cc'
  const action = xmlEscape(`${baseUrl}/api/voice/trainr/payment/return`)
  const statusCallback = xmlEscape(`${baseUrl}/api/voice/trainr/payment/status`)

  return xml(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Perfect. For your security, please enter your card details using your phone keypad. Do not say your card number out loud.</Say>
  <Pay paymentConnector="${xmlEscape(connector)}" chargeAmount="${xmlEscape(amount)}" currency="USD" paymentMethod="credit-card" maxAttempts="2" securityCode="true" postalCode="true" action="${action}" statusCallback="${statusCallback}" />
  <Redirect method="POST">${action}</Redirect>
</Response>`)
}

export async function GET() {
  return new NextResponse('Method not allowed', { status: 405 })
}
