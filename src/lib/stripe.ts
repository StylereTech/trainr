import Stripe from 'stripe'

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || ''
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
const placeholderPrefixes = ['sk_test_xxx', 'pk_test_xxx', 'whsec_xxx', 'sk_test_placeholder']

export function stripeRuntimeStatus() {
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLIC_KEY || process.env.STRIPE_PUBLIC_KEY || ''
  const secretConfigured = !!stripeSecretKey && !placeholderPrefixes.some((prefix) => stripeSecretKey.startsWith(prefix))
  const webhookConfigured = !!stripeWebhookSecret && !placeholderPrefixes.some((prefix) => stripeWebhookSecret.startsWith(prefix))
  const connectWebhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || ''
  const connectWebhookConfigured = !!connectWebhookSecret && !placeholderPrefixes.some((prefix) => connectWebhookSecret.startsWith(prefix))
  const publishableConfigured = !!publishableKey && !placeholderPrefixes.some((prefix) => publishableKey.startsWith(prefix))

  return {
    secretConfigured,
    webhookConfigured,
    connectWebhookConfigured,
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

export function mapStripeError(error: unknown, fallbackMessage = 'Stripe request failed') {
  const detail = error instanceof Error ? error.message : fallbackMessage
  const type = typeof error === 'object' && error && 'type' in error ? String((error as { type?: unknown }).type || '') : ''

  if (type === 'StripeAuthenticationError') {
    return {
      status: 503,
      message: 'Stripe is not configured on this runtime',
      detail,
    }
  }

  if (type === 'StripePermissionError' || type === 'StripeRateLimitError') {
    return {
      status: 503,
      message: 'Stripe is temporarily unavailable. Try again shortly.',
      detail,
    }
  }

  if (type === 'StripeAPIError' || type === 'StripeConnectionError' || /connection to stripe/i.test(detail)) {
    return {
      status: 503,
      message: 'Stripe is temporarily unavailable. Try again shortly.',
      detail,
    }
  }

  if (type === 'StripeInvalidRequestError') {
    if (/no such account|destination|connected account|account.*invalid/i.test(detail)) {
      return {
        status: 400,
        message: 'Trainer payment account needs reconnection before checkout can continue',
        detail,
      }
    }

    return {
      status: 400,
      message: fallbackMessage,
      detail,
    }
  }

  return {
    status: 502,
    message: fallbackMessage,
    detail,
  }
}

export async function createConnectedAccount(trainerId: string, email: string, idempotencyKey: string) {
  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    metadata: { trainerId },
  }, { idempotencyKey, timeout: 15000, maxNetworkRetries: 0 })
  return account
}

export async function requestMissingConnectCapabilities(account: Pick<Stripe.Account, 'id' | 'capabilities'>) {
  for (const capability of ['transfers', 'card_payments'] as const) {
    if (account.capabilities?.[capability]) continue
    await stripe.accounts.updateCapability(account.id, capability, { requested: true },
      { idempotencyKey: `trainr-connect-v2-${account.id}-${capability}`, timeout: 15000, maxNetworkRetries: 0 })
  }
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

export async function createDashboardLink(accountId: string) {
  const link = await stripe.accounts.createLoginLink(accountId)
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

export async function verifyWebhookSignature(payload: string | Buffer, signature: string): Promise<Stripe.Event | null> {
  const platformSecret = process.env.STRIPE_WEBHOOK_SECRET || ''
  const connectSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET || ''
  if (platformSecret && platformSecret === connectSecret) throw new Error('Stripe webhook scopes share a signing secret')
  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(payload, signature, platformSecret)
    if (event.account && event.type === 'account.updated') throw new Error('Connected-account update used the platform webhook scope')
  } catch (platformError) {
    if (!connectSecret || placeholderPrefixes.some((prefix) => connectSecret.startsWith(prefix))) throw platformError

    // Stripe signs platform and connected-account destinations with different secrets.
    event = stripe.webhooks.constructEvent(payload, signature, connectSecret)
    if (!event.account || typeof event.account !== 'string') throw new Error('Connect webhook account scope is missing')
    if (event.type === 'account.updated' && event.data.object.id !== event.account) {
      throw new Error('Connect webhook account identity does not match')
    }
  }

  const keyMode = /^(?:sk|rk)_(test|live)_/.exec(stripeSecretKey)?.[1]
  if (!keyMode || typeof event.livemode !== 'boolean') throw new Error('Stripe webhook mode is invalid')
  // Connect destinations may receive both modes; authenticate before acknowledging an ignored event.
  return event.livemode === (keyMode === 'live') ? event : null
}
