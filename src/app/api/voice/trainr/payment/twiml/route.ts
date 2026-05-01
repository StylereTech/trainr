import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function xmlEscape(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function xml(body: string) {
  return new NextResponse(body, { status: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null)
  const amount = String(form?.get('amount') || req.nextUrl.searchParams.get('amount') || process.env.TRAINR_FOUNDING_LISTING_AMOUNT || '99.00')
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

export async function GET(req: NextRequest) {
  return POST(req)
}
