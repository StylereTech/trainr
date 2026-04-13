import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const placeholderPrefixes = ['sk_test_xxx', 'pk_test_xxx', 'whsec_xxx', 'sk_test_placeholder']

export function stripeRuntimeStatus() {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || process.env.STRIPE_PUBLIC_KEY || ''
  const secretConfigured = !!stripeSecretKey && !placeholderPrefixes.some((prefix) => stripeSecretKey.startsWith(prefix))
  const webhookConfigured = !!stripeWebhookSecret && !placeholderPrefixes.some((prefix) => stripeWebhookSecret.startsWith(prefix))
  const publishableConfigured = !!publishableKey && !placeholderPrefixes.some((prefix) => publishableKey.startsWith(prefix))

  return {
    secretConfigured,
    webhookConfigured,
    publishableConfigured,
    isFullyConfigured: secretConfigured && webhookConfigured && publishableConfigured,
  }
}

export const stripe = new Stripe(stripeSecretKey || 'sk_test_placeholder', {
  apiVersion: '2024-06-20',
  typescript: true,
  timeout: 30000,
  maxNetworkRetries: 3,
})

export async function createConnectedAccount(trainerId: string, email: string) {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email,
    metadata: { trainerId },
  })
  return account
}

export async function createAccountLink(accountId: string, returnUrl: string, refreshUrl: string) {
  const link = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  })
  return link
}

export async function createPaymentIntent(
  amountInCents: number,
  trainerStripeAccountId: string,
  platformFeeInCents: number,
  bookingId: string
) {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInCents,
    currency: 'usd',
    application_fee_amount: platformFeeInCents,
    transfer_data: {
      destination: trainerStripeAccountId,
    },
    metadata: { bookingId },
    automatic_payment_methods: { enabled: true },
  })
  return paymentIntent
}

export async function refundPayment(paymentIntentId: string, amount?: number) {
  const refund = await stripe.refunds.create({
    payment_intent: paymentIntentId,
    amount,
  })
  return refund
}

export async function verifyWebhookSignature(payload: string | Buffer, signature: string) {
  const event = stripe.webhooks.constructEvent(
    payload,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET || ''
  )
  return event
}
