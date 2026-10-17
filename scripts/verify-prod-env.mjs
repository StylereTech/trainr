#!/usr/bin/env node
import { loadReadinessEnv, productionEnvErrors, verifyStripeLive } from './readiness-checks.mjs'

try {
  loadReadinessEnv(process.cwd())
  const errors = productionEnvErrors(process.env)
  if (errors.length === 0) {
    const stripeError = await verifyStripeLive(process.env.STRIPE_SECRET_KEY)
    if (stripeError) errors.push(stripeError)
  }
  for (const error of errors) console.error(`FAIL: ${error}`)
  if (errors.length) {
    console.error('PROD ENV CHECK: FAIL')
    process.exitCode = 1
  } else {
    console.log('PROD ENV CHECK: PASS (configuration and read-only Stripe authentication only)')
    console.log('Not checkout, webhook delivery, Connect, payout, email delivery, or schema signoff.')
    console.log('Effective booking fees come from database FeeConfig, not an environment percentage.')
  }
} catch {
  console.error('PROD ENV CHECK: FAIL (could not load or validate configuration)')
  process.exitCode = 1
}
