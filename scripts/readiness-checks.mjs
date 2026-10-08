import fs from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'

/** @param {string} cwd @param {Record<string, string | undefined>} env */
export function loadReadinessEnv(cwd, env = process.env) {
  // Match production file precedence, without replacing explicitly supplied values.
  for (const name of ['.env.production.local', '.env.local', '.env.production', '.env']) {
    const file = path.join(cwd, name)
    if (!fs.existsSync(file)) continue
    for (const [key, value] of Object.entries(parseEnv(fs.readFileSync(file, 'utf8')))) {
      if (!(key in env)) env[key] = value
    }
  }
}

export function productionEnvErrors(env) {
  const errors = []
  const required = ['DATABASE_URL', 'NEXTAUTH_URL', 'NEXTAUTH_SECRET',
    'NEXT_PUBLIC_STRIPE_PUBLIC_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET',
    'RESEND_API_KEY', 'EMAIL_FROM', 'NEXT_PUBLIC_APP_URL']
  for (const key of required) {
    const value = env[key]?.trim() || ''
    if (!value) errors.push(`${key} is missing`)
    else if (/xxx|placeholder|changeme|your_|change-in-production|local_fixture/i.test(value)) {
      errors.push(`${key} looks like a placeholder`)
    }
  }
  for (const key of ['NEXTAUTH_URL', 'NEXT_PUBLIC_APP_URL']) {
    if (env[key] && !/^https:\/\/trainr\.cc\/?$/.test(env[key])) errors.push(`${key} must be the canonical production origin https://trainr.cc`)
  }
  if (env.NEXTAUTH_SECRET && env.NEXTAUTH_SECRET.length < 32) errors.push('NEXTAUTH_SECRET must contain at least 32 characters')
  if (env.STRIPE_SECRET_KEY && !/^sk_live_\S+$/.test(env.STRIPE_SECRET_KEY)) errors.push('STRIPE_SECRET_KEY must be live mode for production verification')
  if (env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY && !/^pk_live_\S+$/.test(env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY)) errors.push('NEXT_PUBLIC_STRIPE_PUBLIC_KEY must be live mode for production verification')
  if (env.STRIPE_PUBLIC_KEY && env.STRIPE_PUBLIC_KEY !== env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY) errors.push('Stripe publishable keys do not match')
  if (env.STRIPE_WEBHOOK_SECRET && !/^whsec_\S+$/.test(env.STRIPE_WEBHOOK_SECRET)) errors.push('STRIPE_WEBHOOK_SECRET has an invalid format')
  if (env.DATABASE_URL && !databaseCheckUrl(env.DATABASE_URL)) errors.push('DATABASE_URL must be a valid PostgreSQL URL')
  return errors
}

export function databaseCheckUrl(value) {
  try {
    const url = new URL(value)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.pathname.length < 2) return null
    url.searchParams.set('connect_timeout', '5')
    url.searchParams.set('pool_timeout', '5')
    url.searchParams.set('socket_timeout', '10')
    url.searchParams.set('connection_limit', '1')
    return url.toString()
  } catch {
    return null
  }
}

export async function verifyStripeLive(secret, fetcher = fetch) {
  try {
    const response = await fetcher('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(10000), redirect: 'error',
    })
    if (!response.ok) return `Stripe API authentication failed (HTTP ${response.status})`
    const balance = await response.json()
    if (balance?.object !== 'balance' || balance.livemode !== true) return 'Stripe did not confirm a live-mode balance response'
    return null
  } catch {
    // Provider bodies, connection strings and exception messages can contain secrets.
    return 'Stripe verification failed or timed out; inspect the provider dashboard privately'
  }
}

export async function verifyDatabaseQuery(client) {
  const result = await client.$queryRawUnsafe('SELECT 1 AS readiness')
  return Array.isArray(result) && result.length === 1 && result[0].readiness === 1
}
