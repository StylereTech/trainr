#!/usr/bin/env node
/**
 * Search/provision a dedicated Trainr Twilio number.
 *
 * Safe default: search only. Add --buy to purchase the first candidate.
 */

const ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID
const AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN
const PUBLIC_URL = process.env.PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://trainr.cc'
const AREA_CODE = process.env.TRAINR_AREA_CODE || '214'
const shouldBuy = process.argv.includes('--buy')

if (!ACCOUNT_SID || !AUTH_TOKEN) {
  console.error('TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are required')
  process.exit(1)
}

const auth = Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString('base64')

async function twilio(path, init = {}) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${text}`)
  return JSON.parse(text)
}

const search = await twilio(`/AvailablePhoneNumbers/US/Local.json?AreaCode=${encodeURIComponent(AREA_CODE)}&VoiceEnabled=true&SmsEnabled=true&PageSize=10`)
const candidates = search.available_phone_numbers || []
console.log(JSON.stringify({ areaCode: AREA_CODE, candidates: candidates.map((n) => ({ phoneNumber: n.phone_number, locality: n.locality, region: n.region })) }, null, 2))

if (!shouldBuy) {
  console.log('Search only. Re-run with --buy after Jefe approves the paid Twilio number purchase.')
  process.exit(0)
}

if (!candidates.length) throw new Error(`No available Trainr numbers found for area code ${AREA_CODE}`)
const selected = candidates[0]
const params = new URLSearchParams({
  PhoneNumber: selected.phone_number,
  FriendlyName: 'Trainr AI Onboarding',
  VoiceUrl: `${PUBLIC_URL}/api/voice/trainr/twiml`,
  VoiceMethod: 'POST',
})
const purchased = await twilio('/IncomingPhoneNumbers.json', { method: 'POST', body: params })
console.log(JSON.stringify({ purchased: { phoneNumber: purchased.phone_number, sid: purchased.sid, friendlyName: purchased.friendly_name } }, null, 2))
