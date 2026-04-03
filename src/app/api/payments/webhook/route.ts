import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe, stripeRuntimeStatus, verifyWebhookSignature } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import Stripe from 'stripe'

// POST /api/payments/webhook — Stripe webhook handler
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!stripeRuntimeStatus().webhookConfigured || !stripeRuntimeStatus().secretConfigured) {
    return NextResponse.json({ error: 'Stripe webhook is not configured on this runtime' }, { status: 503 })
  }

  const body = await req.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = await verifyWebhookSignature(body, signature)
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle events
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const bookingId = session.metadata?.bookingId

      if (bookingId) {
        const paymentIntentId = session.payment_intent as string

        // Update payment status
        await prisma.payment.upsert({
          where: { bookingId },
          update: {
            stripePaymentIntentId: paymentIntentId,
            status: 'SUCCEEDED',
          },
          create: {
            bookingId,
            stripePaymentIntentId: paymentIntentId,
            amountInCents: session.amount_total || 0,
            platformFeeInCents: 0,
            trainerPayoutInCents: 0,
            status: 'SUCCEEDED',
          },
        })

        // Confirm booking
        const booking = await prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'CONFIRMED' },
          include: { trainerProfile: true, parentProfile: true },
        })

        // Notify both parties
        await prisma.notification.createMany({
          data: [
            {
              userId: booking.trainerProfile.userId,
              type: 'PAYMENT_RECEIVED',
              title: 'Payment Received!',
              message: `Payment of $${((session.amount_total || 0) / 100).toFixed(2)} received for session on ${new Date(booking.date).toLocaleDateString()}.`,
              data: { bookingId },
            },
            {
              userId: booking.parentProfile.userId,
              type: 'BOOKING_CONFIRMED',
              title: 'Booking Confirmed! ✅',
              message: `Your session with ${booking.trainerProfile.firstName} ${booking.trainerProfile.lastName} on ${new Date(booking.date).toLocaleDateString()} is confirmed.`,
              data: { bookingId },
            },
          ],
        })
      }
      break
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const bookingId = paymentIntent.metadata?.bookingId

      if (bookingId) {
        await prisma.payment.updateMany({
          where: { bookingId },
          data: {
            stripeChargeId: paymentIntent.latest_charge as string,
            status: 'SUCCEEDED',
          },
        })
      }
      break
    }

    case 'payment_intent.payment_failed': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent
      const bookingId = paymentIntent.metadata?.bookingId

      if (bookingId) {
        await prisma.payment.updateMany({
          where: { bookingId },
          data: { status: 'FAILED' },
        })
      }
      break
    }

    case 'charge.refunded': {
      const charge = event.data.object as Stripe.Charge
      const bookingId = charge.metadata?.bookingId

      if (bookingId) {
        const refundAmount = charge.amount_refunded
        const isFullRefund = charge.amount === charge.amount_refunded

        await prisma.payment.updateMany({
          where: { bookingId },
          data: {
            status: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
            refundAmountInCents: refundAmount,
          },
        })

        if (isFullRefund) {
          await prisma.booking.updateMany({
            where: { id: bookingId },
            data: { status: 'CANCELLED' },
          })
        }
      }
      break
    }

    case 'account.updated': {
      // Stripe Connect onboarding updates
      const account = event.data.object as Stripe.Account
      if (account.charges_enabled && account.details_submitted) {
        // Find trainer by stripe account id
        await prisma.trainerProfile.updateMany({
          where: { stripeAccountId: account.id },
          data: { stripeOnboardingComplete: true },
        })
      }
      break
    }

    case 'transfer.created': {
      const transfer = event.data.object as Stripe.Transfer
      const bookingId = transfer.metadata?.bookingId

      if (bookingId) {
        await prisma.payment.updateMany({
          where: { bookingId },
          data: { stripeTransferId: transfer.id },
        })
      }
      break
    }

    default:
      console.log(`Unhandled event type: ${event.type}`)
  }

  return NextResponse.json({ received: true })
}
