import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe, stripeRuntimeStatus, verifyWebhookSignature } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { calculateSplit } from '@/lib/fees'
import Stripe from 'stripe'

export const runtime = 'nodejs'

async function creditTrainerWallet(bookingId: string, trainerProfileId: string, trainerShareCents: number) {
  await prisma.$transaction(async (tx: any) => {
    // Find or create wallet
    let wallet = await tx.trainerWallet.findUnique({
      where: { trainerProfileId },
    })

    if (!wallet) {
      wallet = await tx.trainerWallet.create({
        data: { trainerProfileId },
      })
    }

    // Check for duplicate credit (idempotency)
    const existingEntry = await tx.walletEntry.findFirst({
      where: { walletId: wallet.id, bookingId, type: 'BOOKING_CREDIT' },
    })
    if (existingEntry) return // Already credited

    // Create ledger entry
    await tx.walletEntry.create({
      data: {
        walletId: wallet.id,
        bookingId,
        type: 'BOOKING_CREDIT',
        amountInCents: trainerShareCents,
        description: `Booking payment credit for booking ${bookingId}`,
      },
    })

    // Update available balance
    await tx.trainerWallet.update({
      where: { id: wallet.id },
      data: { availableBalance: { increment: trainerShareCents } },
    })
  })
}

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

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const bookingId = session.metadata?.bookingId

      if (bookingId) {
        const paymentIntentId = session.payment_intent as string

        // Get booking for split calculation
        const booking = await prisma.booking.findUnique({
          where: { id: bookingId },
          include: { trainerProfile: true, parentProfile: true },
        })

        if (!booking) break

        const { platformFee, trainerShare } = calculateSplit(booking.totalAmountInCents)

        // Update payment status
        await prisma.payment.upsert({
          where: { bookingId },
          update: {
            stripePaymentIntentId: paymentIntentId,
            status: 'SUCCEEDED',
            platformFeeInCents: platformFee,
            trainerPayoutInCents: trainerShare,
          },
          create: {
            bookingId,
            stripePaymentIntentId: paymentIntentId,
            amountInCents: booking.totalAmountInCents,
            platformFeeInCents: platformFee,
            trainerPayoutInCents: trainerShare,
            status: 'SUCCEEDED',
          },
        })

        // Confirm booking
        await prisma.booking.update({
          where: { id: bookingId },
          data: { status: 'CONFIRMED' },
        })

        // Credit trainer wallet
        await creditTrainerWallet(bookingId, booking.trainerProfileId, trainerShare)

        // Notify both parties
        await prisma.notification.createMany({
          data: [
            {
              userId: booking.trainerProfile.userId,
              type: 'PAYMENT_RECEIVED',
              title: 'Payment Received!',
              message: `Payment of $${(booking.totalAmountInCents / 100).toFixed(2)} received. Your share of $${(trainerShare / 100).toFixed(2)} has been credited to your wallet.`,
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
      const account = event.data.object as Stripe.Account
      if (account.charges_enabled && account.details_submitted) {
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
