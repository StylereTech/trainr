import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripeRuntimeStatus, verifyWebhookSignature } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { isStripeAccountReady } from '@/lib/stripe-account'
import { applyPaymentEvidence, PaymentEventConflict } from '@/lib/stripe-payment-events'
import Stripe from 'stripe'

export const runtime = 'nodejs'

function stripeId(value: string | { id: string } | null): string | null {
  return typeof value === 'string' ? value : value?.id || null
}

export async function POST(req: NextRequest) {
  if (!stripeRuntimeStatus().webhookConfigured || !stripeRuntimeStatus().secretConfigured) {
    return NextResponse.json({ error: 'Stripe webhook is not configured on this runtime' }, { status: 503 })
  }

  const body = await req.text()
  const signature = (await headers()).get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })

  let event: Stripe.Event
  try {
    event = await verifyWebhookSignature(body, signature)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.payment_status !== 'paid' || !session.metadata?.bookingId) break
        await applyPaymentEvidence({
          bookingId: session.metadata.bookingId, paymentId: session.metadata.paymentId,
          sessionId: session.id, intentId: stripeId(session.payment_intent),
          amount: session.amount_total, currency: session.currency, outcome: 'paid',
        })
        break
      }
      case 'payment_intent.succeeded':
      case 'payment_intent.payment_failed': {
        const intent = event.data.object as Stripe.PaymentIntent
        if (!intent.metadata?.bookingId) break
        await applyPaymentEvidence({
          bookingId: intent.metadata.bookingId, paymentId: intent.metadata.paymentId,
          intentId: intent.id,
          // A failed attempt may have a charge different from the later successful retry.
          chargeId: event.type === 'payment_intent.succeeded' ? stripeId(intent.latest_charge) : null,
          amount: event.type === 'payment_intent.succeeded' ? intent.amount_received : intent.amount,
          currency: intent.currency, outcome: event.type === 'payment_intent.succeeded' ? 'paid' : 'failed',
        })
        break
      }
      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        if (!charge.metadata?.bookingId) break
        await applyPaymentEvidence({
          bookingId: charge.metadata.bookingId, paymentId: charge.metadata.paymentId,
          intentId: stripeId(charge.payment_intent), chargeId: charge.id,
          amount: charge.amount, currency: charge.currency,
          refundAmount: charge.amount_refunded, outcome: 'refunded',
        })
        break
      }
      case 'account.updated': {
        const account = event.data.object as Stripe.Account
        await prisma.trainerProfile.updateMany({
          where: { stripeAccountId: account.id },
          data: { stripeOnboardingComplete: isStripeAccountReady(account) },
        })
        break
      }
      // Destination-charge transfers are not guaranteed to inherit booking metadata.
      // Do not attach financial objects to a booking solely from transfer metadata.
    }
  } catch (error) {
    if (error instanceof PaymentEventConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 })
    }
    console.error('Stripe webhook persistence failed', { eventId: event.id, type: event.type })
    return NextResponse.json({ error: 'Payment event could not be persisted; retry required' }, { status: 503 })
  }

  return NextResponse.json({ received: true })
}
