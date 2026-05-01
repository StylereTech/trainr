#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

function loadDotEnv(filePath, { override = false } = {}) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    if (override || !(key in process.env)) process.env[key] = value
  }
}

const cwd = process.cwd()
const productionEnvPath = path.join(cwd, '.env.production.local')
if (fs.existsSync(productionEnvPath)) {
  loadDotEnv(productionEnvPath, { override: true })
} else {
  loadDotEnv(path.join(cwd, '.env'))
  loadDotEnv(path.join(cwd, '.env.local'))
}

const required = [
  'DATABASE_URL',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'NEXT_PUBLIC_STRIPE_PUBLIC_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PLATFORM_FEE_PERCENT',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_APP_URL',
]

const placeholderFragments = ['xxx', 'placeholder', 'changeme', 'your_', 'sk_test_xxx', 'pk_test_xxx', 'whsec_xxx']
let failed = false
const fail = (message) => {
  failed = true
  console.error(`FAIL: ${message}`)
}
const pass = (message) => console.log(`PASS: ${message}`)

for (const key of required) {
  const value = process.env[key] || ''
  if (!value) fail(`${key} is missing`)
  else if (placeholderFragments.some((fragment) => value.toLowerCase().includes(fragment))) fail(`${key} looks like a placeholder`)
  else pass(`${key} is present`)
}

const secret = process.env.STRIPE_SECRET_KEY || ''
const nextPublicKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || ''
const publicKey = process.env.STRIPE_PUBLIC_KEY || nextPublicKey
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const appUrl = process.env.NEXT_PUBLIC_APP_URL || ''
const authUrl = process.env.NEXTAUTH_URL || ''
const platformFee = Number(process.env.STRIPE_PLATFORM_FEE_PERCENT || '')

if (process.env.STRIPE_PUBLIC_KEY && nextPublicKey && process.env.STRIPE_PUBLIC_KEY !== nextPublicKey) fail('STRIPE_PUBLIC_KEY and NEXT_PUBLIC_STRIPE_PUBLIC_KEY do not match')
else if (publicKey && nextPublicKey) pass('Stripe publishable key is configured')

if (secret && publicKey) {
  const secretMode = secret.startsWith('sk_live_') ? 'live' : secret.startsWith('sk_test_') ? 'test' : 'unknown'
  const publicMode = publicKey.startsWith('pk_live_') ? 'live' : publicKey.startsWith('pk_test_') ? 'test' : 'unknown'
  if (secretMode === 'unknown') fail('STRIPE_SECRET_KEY has an unknown prefix')
  if (publicMode === 'unknown') fail('STRIPE_PUBLIC_KEY has an unknown prefix')
  if (secretMode !== 'unknown' && publicMode !== 'unknown' && secretMode !== publicMode) fail('Stripe secret and publishable key modes do not match')
  else if (secretMode !== 'unknown') pass(`Stripe keys are both ${secretMode} mode`)
}

if (webhookSecret && !webhookSecret.startsWith('whsec_')) fail('STRIPE_WEBHOOK_SECRET must start with whsec_')
else if (webhookSecret) pass('Stripe webhook secret has valid prefix')

if (!process.env.STRIPE_PLATFORM_FEE_PERCENT || !Number.isFinite(platformFee) || platformFee < 0 || platformFee > 50) fail('STRIPE_PLATFORM_FEE_PERCENT must be a number from 0 to 50')
else pass(`Stripe platform fee is ${platformFee}%`)

for (const [key, value] of [['NEXT_PUBLIC_APP_URL', appUrl], ['NEXTAUTH_URL', authUrl]]) {
  if (value && !/^https:\/\/trainr\.cc\/?$/.test(value)) fail(`${key} should be https://trainr.cc for production, got ${value}`)
  else if (value) pass(`${key} points at trainr.cc`)
}

if (secret && !failed) {
  try {
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${secret}` },
    })
    if (res.ok) pass('Stripe API authentication succeeded')
    else {
      const text = await res.text()
      fail(`Stripe API authentication failed with HTTP ${res.status}: ${text.slice(0, 180)}`)
    }
  } catch (error) {
    fail(`Stripe API check failed: ${error.message}`)
  }
}

if (failed) {
  console.error('\nPROD ENV CHECK: FAIL')
  process.exit(1)
}

console.log('\nPROD ENV CHECK: PASS')
