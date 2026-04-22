import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { toAbsoluteAppUrl } from '@/lib/app-url'
import { mapStripeError, stripe, stripeRuntimeStatus } from '@/lib/stripe'

export async function POST(req: NextRequest) {
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

    if (booking.payment) {
      return NextResponse.json({ error: 'Payment already initiated' }, { status: 400 })
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
          platformFeeInCents: String(booking.platformFeeInCents),
          trainerPayoutInCents: String(booking.trainerPayoutInCents),
        },
      },
      metadata: {
        bookingId: booking.id,
        parentId: booking.parentProfile.id,
      },
      success_url: toAbsoluteAppUrl('/parent/dashboard?payment=success'),
      cancel_url: toAbsoluteAppUrl('/parent/dashboard?payment=cancelled'),
    })

    const payment = await prisma.payment.create({
      data: {
        bookingId: booking.id,
        amountInCents: booking.totalAmountInCents,
        platformFeeInCents: booking.platformFeeInCents,
        trainerPayoutInCents: booking.trainerPayoutInCents,
        status: 'PENDING',
      },
    })

    return NextResponse.json({
      checkoutUrl: checkoutSession.url,
      paymentId: payment.id,
    })
  } catch (error) {
    const normalized = mapStripeError(error, 'Failed to create checkout session')
    return NextResponse.json({ error: normalized.message, detail: normalized.detail }, { status: normalized.status })
  }
}
