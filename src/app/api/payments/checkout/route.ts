import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toAbsoluteAppUrl } from '@/lib/app-url'
import { mapStripeError, stripe, stripeRuntimeStatus } from '@/lib/stripe'

const RETRYABLE_PAYMENT_STATUSES = new Set(['PENDING', 'FAILED'])
const BLOCKING_PAYMENT_STATUSES = new Set(['PROCESSING', 'SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED'])

function getExistingPaymentError(status: string) {
  switch (status) {
    case 'PROCESSING':
      return 'Payment is already processing for this booking.'
    case 'SUCCEEDED':
      return 'Payment already completed for this booking.'
    case 'REFUNDED':
    case 'PARTIALLY_REFUNDED':
      return 'This booking already has payment history and cannot be retried automatically.'
    default:
      return 'Payment state for this booking prevents retrying checkout right now.'
  }
}

async function expireRetryableCheckoutSession(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    if (session.status === 'complete' || session.payment_status === 'paid') {
      return {
        blockingError: 'Payment is already processing or completed for this booking.',
      }
    }

    if (session.status === 'open') {
      await stripe.checkout.sessions.expire(sessionId)
    }

    return { blockingError: null as string | null }
  } catch (error: any) {
    const code = error?.code || error?.raw?.code
    const type = error?.type || error?.rawType

    if (code === 'resource_missing' || type === 'StripeInvalidRequestError') {
      return { blockingError: null as string | null }
    }

    throw error
  }
}

export async function POST(req: NextRequest) {
  let createdPaymentId: string | null = null

  try {
    const requestUser = await getRequestUser(req)
    if (!requestUser?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const runtime = stripeRuntimeStatus()
    if (!runtime.secretConfigured) {
      return NextResponse.json({ error: 'Stripe is not configured on this runtime' }, { status: 503 })
    }

    const body = await req.json()
    const { bookingId } = body

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId required' }, { status: 400 })
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        parentProfile: true,
        trainerProfile: true,
        serviceOffering: true,
        athleteProfile: true,
        payment: true,
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    if (!booking.parentProfile || booking.parentProfile.userId !== requestUser.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (booking.status !== 'CONFIRMED') {
      return NextResponse.json({ error: 'Booking must be confirmed before payment' }, { status: 400 })
    }

    if (!booking.trainerProfile) {
      return NextResponse.json({ error: 'Trainer profile is missing for this booking' }, { status: 409 })
    }

    if (!booking.serviceOffering) {
      return NextResponse.json({ error: 'Service offering is missing for this booking' }, { status: 409 })
    }

    if (!booking.athleteProfile) {
      return NextResponse.json({ error: 'Athlete profile is missing for this booking' }, { status: 409 })
    }

    if (!booking.trainerProfile.stripeAccountId || !booking.trainerProfile.stripeOnboardingComplete) {
      return NextResponse.json(
        { error: 'Trainer payment account is not ready yet. Ask the trainer to finish Stripe setup first.' },
        { status: 400 },
      )
    }

    let paymentRecord = booking.payment

    if (paymentRecord) {
      if (BLOCKING_PAYMENT_STATUSES.has(paymentRecord.status)) {
        return NextResponse.json({ error: getExistingPaymentError(paymentRecord.status) }, { status: 409 })
      }

      if (!RETRYABLE_PAYMENT_STATUSES.has(paymentRecord.status)) {
        return NextResponse.json(
          { error: 'Payment state for this booking prevents retrying checkout right now.' },
          { status: 409 },
        )
      }

      if (paymentRecord.stripeChargeId || paymentRecord.stripeTransferId) {
        return NextResponse.json(
          { error: 'This booking already has payment activity attached and cannot be retried automatically.' },
          { status: 409 },
        )
      }

      if (paymentRecord.stripePaymentIntentId && !paymentRecord.stripeCheckoutSessionId) {
        return NextResponse.json(
          { error: 'This booking has an in-flight payment record that needs manual review before retrying.' },
          { status: 409 },
        )
      }

      if (paymentRecord.stripeCheckoutSessionId) {
        const { blockingError } = await expireRetryableCheckoutSession(paymentRecord.stripeCheckoutSessionId)
        if (blockingError) {
          return NextResponse.json({ error: blockingError }, { status: 409 })
        }
      }
    } else {
      paymentRecord = await prisma.payment.create({
        data: {
          bookingId: booking.id,
          amountInCents: booking.totalAmountInCents,
          platformFeeInCents: booking.platformFeeInCents,
          trainerPayoutInCents: booking.trainerPayoutInCents,
          status: 'PENDING',
        },
      })
      createdPaymentId = paymentRecord.id
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: requestUser.email || undefined,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${booking.serviceOffering.title} with ${booking.trainerProfile.firstName} ${booking.trainerProfile.lastName}`,
              description: `${booking.date.toISOString().split('T')[0]} at ${booking.startTime}`,
              metadata: {
                bookingId: booking.id,
                athleteId: booking.athleteProfile.id,
                trainerId: booking.trainerProfile.id,
                paymentId: paymentRecord.id,
              },
            },
            unit_amount: booking.totalAmountInCents,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: booking.platformFeeInCents,
        transfer_data: {
          destination: booking.trainerProfile.stripeAccountId,
        },
        metadata: {
          bookingId: booking.id,
          parentId: booking.parentProfile.id,
          trainerId: booking.trainerProfile.id,
          athleteId: booking.athleteProfile.id,
          serviceOfferingId: booking.serviceOffering.id,
          paymentId: paymentRecord.id,
          platformFeeInCents: String(booking.platformFeeInCents),
          trainerPayoutInCents: String(booking.trainerPayoutInCents),
        },
      },
      metadata: {
        bookingId: booking.id,
        parentId: booking.parentProfile.id,
        paymentId: paymentRecord.id,
      },
      success_url: toAbsoluteAppUrl('/parent/dashboard?payment=success'),
      cancel_url: toAbsoluteAppUrl('/parent/dashboard?payment=cancelled'),
    })

    const payment = await prisma.payment.update({
      where: { id: paymentRecord.id },
      data: {
        amountInCents: booking.totalAmountInCents,
        platformFeeInCents: booking.platformFeeInCents,
        trainerPayoutInCents: booking.trainerPayoutInCents,
        processingFeeInCents: 0,
        status: 'PENDING',
        refundAmountInCents: 0,
        refundReason: null,
        stripeCheckoutSessionId: checkoutSession.id,
        stripePaymentIntentId: null,
        stripeChargeId: null,
        stripeTransferId: null,
      },
    })

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      paymentId: payment.id,
    })
  } catch (error) {
    if (createdPaymentId) {
      await prisma.payment.delete({ where: { id: createdPaymentId } }).catch(() => null)
    }

    const normalized = mapStripeError(error, 'Failed to create checkout session')
    return NextResponse.json({ error: normalized.message, detail: normalized.detail }, { status: normalized.status })
  }
}
