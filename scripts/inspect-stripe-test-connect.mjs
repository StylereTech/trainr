#!/usr/bin/env node
import Stripe from 'stripe'

const key = process.env.STRIPE_SECRET_KEY || ''
const accountId = process.argv[2] || ''
if (!key.startsWith('sk_test_') || key === 'sk_test_placeholder' || !/^acct_[A-Za-z0-9]+$/.test(accountId)) {
  console.error('STRIPE TEST CONNECT: FAIL (test key and account ID required)')
  process.exit(1)
}

const stripe = new Stripe(key, { apiVersion: '2024-06-20', timeout: 30000, maxNetworkRetries: 2 })

try {
  const account = await stripe.accounts.retrieve(accountId)
  if (account.livemode) throw new Error('live account refused')

  console.log(JSON.stringify({
    livemode: account.livemode,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    capabilities: {
      cardPayments: account.capabilities?.card_payments || null,
      transfers: account.capabilities?.transfers || null,
    },
    requirements: {
      currentlyDue: account.requirements?.currently_due || [],
      pastDue: account.requirements?.past_due || [],
      pendingVerification: account.requirements?.pending_verification || [],
      disabledReason: account.requirements?.disabled_reason || null,
    },
  }, null, 2))
} catch {
  console.error('STRIPE TEST CONNECT: FAIL (provider read failed; no account data or key printed)')
  process.exitCode = 1
}
