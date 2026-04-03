import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, stripeRuntimeStatus } from '@/lib/stripe'
import { toAbsoluteAppUrl } from '@/lib/app-url'
import { calculateSplit } from '@/lib/fees'

// POST /api/payments/checkout — Create a Stripe checkout session for a booking
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id

    if (!stripeRuntimeStatus().secretConfigured) {
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
        trainerProfile: true,
        serviceOffering: true,
        parentProfile: { include: { user: true } },
        athleteProfile: true,
      },
    })

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    }

    // Verify the booking belongs to this parent
    if (booking.parentProfile.userId !== userId) {
      return NextResponse.json({ error: 'Not your booking' }, { status: 403 })
    }

    if (booking.status !== 'PENDING' && booking.status !== 'CONFIRMED') {
      return NextResponse.json({ error: 'Booking is not in a payable state' }, { status: 400 })
    }

    // Check if payment already exists
    const existingPayment = await prisma.payment.findUnique({ where: { bookingId } })
    if (existingPayment?.stripePaymentIntentId) {
      return NextResponse.json({ error: 'Payment already initiated' }, { status: 400 })
    }

    // Get current fee config
    const feeConfig = await prisma.feeConfig.findFirst({
      where: { isActive: true },
      orderBy: { effectiveDate: 'desc' },
    })
    const commissionPercent = feeConfig?.platformCommissionPercent ?? 15
    const { platformFee: platformFeeInCents, trainerShare: trainerPayoutInCents } = calculateSplit(booking.totalAmountInCents, commissionPercent)

    // Determine if trainer has Stripe Connect (marketplace split) or direct charge (platform collects)
    const hasConnect = booking.trainerProfile.stripeAccountId && booking.trainerProfile.stripeOnboardingComplete

    // Build Stripe Checkout Session options
    const checkoutParams: any = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: booking.totalAmountInCents,
            product_data: {
              name: `${booking.serviceOffering.title} with ${booking.trainerProfile.firstName} ${booking.trainerProfile.lastName}`,
              description: `${new Date(booking.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} at ${booking.startTime} — ${booking.athleteProfile.firstName} ${booking.athleteProfile.lastName}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId: booking.id,
      },
      success_url: toAbsoluteAppUrl(`/dashboard?payment=success&booking=${bookingId}`),
      cancel_url: toAbsoluteAppUrl(`/parent/dashboard?payment=cancelled&booking=${bookingId}`),
      customer_email: booking.parentProfile.user.email,
    }

    // If trainer has Connect, use marketplace split (application_fee + transfer)
    // Otherwise, direct charge to platform — trainer share tracked in wallet for manual payout
    if (hasConnect) {
      checkoutParams.payment_intent_data = {
        application_fee_amount: platformFeeInCents,
        transfer_data: {
          destination: booking.trainerProfile.stripeAccountId,
        },
        metadata: {
          bookingId: booking.id,
          trainerId: booking.trainerProfileId,
          parentId: booking.parentProfileId,
        },
      }
    } else {
      checkoutParams.payment_intent_data = {
        metadata: {
          bookingId: booking.id,
          trainerId: booking.trainerProfileId,
          parentId: booking.parentProfileId,
          directCharge: 'true', // Flag for webhook to track trainer payout manually
        },
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create(checkoutParams)

    // Create or update payment record
    await prisma.payment.upsert({
      where: { bookingId: booking.id },
      update: {
        amountInCents: booking.totalAmountInCents,
        platformFeeInCents,
        trainerPayoutInCents,
        status: 'PENDING',
      },
      create: {
        bookingId: booking.id,
        amountInCents: booking.totalAmountInCents,
        platformFeeInCents,
        trainerPayoutInCents,
        processingFeeInCents: 0,
        status: 'PENDING',
      },
    })

    return NextResponse.json({ checkoutUrl: checkoutSession.url, sessionId: checkoutSession.id })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
  }
}
