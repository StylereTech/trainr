import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { mapStripeError, stripe, stripeRuntimeStatus } from '@/lib/stripe'
import { isStripeAccountReady } from '@/lib/stripe-account'
import { CheckoutConflict, startOrResumeCheckout } from '@/lib/checkout-attempts'

const checkoutBody = z.object({ bookingId: z.string().trim().min(1).max(128) })

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Only parents can pay for bookings' }, { status: 403 })
    if (!stripeRuntimeStatus().secretConfigured) {
      return NextResponse.json({ error: 'Stripe is not configured on this runtime' }, { status: 503 })
    }
    const input = checkoutBody.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: 'A valid bookingId is required' }, { status: 400 })
    const { bookingId } = input.data
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId }, include: { parentProfile: true, trainerProfile: true },
    })
    if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
    if (booking.parentProfile.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
      return NextResponse.json({ error: 'Booking cannot be paid in its current state' }, { status: 409 })
    }
    if (!booking.trainerProfile.isActive || booking.trainerProfile.approvalStatus !== 'APPROVED') {
      return NextResponse.json({ error: 'Trainer is not available for checkout. Contact support about this booking.' }, { status: 409 })
    }
    const accountId = booking.trainerProfile.stripeAccountId
    if (!accountId) return NextResponse.json({ error: 'Trainer must finish Stripe setup before checkout' }, { status: 400 })
    const account = await stripe.accounts.retrieve(accountId)
    const ready = isStripeAccountReady(account)
    if (ready !== booking.trainerProfile.stripeOnboardingComplete) {
      await prisma.trainerProfile.update({ where: { id: booking.trainerProfile.id }, data: { stripeOnboardingComplete: ready } })
    }
    if (!ready) return NextResponse.json({ error: 'Trainer must finish Stripe setup before checkout' }, { status: 400 })
    return NextResponse.json(await startOrResumeCheckout(bookingId, user, accountId))
  } catch (error) {
    if (error instanceof CheckoutConflict) return NextResponse.json({ error: error.message }, { status: 409 })
    const normalized = mapStripeError(error, 'Unable to prepare checkout. Try again or contact support.')
    return NextResponse.json({ error: normalized.message }, { status: normalized.status })
  }
}
