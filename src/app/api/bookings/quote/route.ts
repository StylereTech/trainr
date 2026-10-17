import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { effectiveFeeValues } from '@/lib/fee-config'
import { bookingPrice, BookingPriceError, normalizeCouponCode } from '@/lib/booking-price'
import { bookingQuoteInput } from '@/lib/booking-quote-schema'

const headers = { 'Cache-Control': 'private, no-store' }
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Parent access is required' }, { status: 403, headers })
    const input = bookingQuoteInput.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: 'Choose a service and a promo code of at most 32 characters.' }, { status: 400, headers })
    const { serviceOfferingId, couponCode = '' } = input.data
    const quote = await prisma.$transaction(async tx => {
      const service = await tx.serviceOffering.findUnique({ where: { id: serviceOfferingId }, include: { trainerProfile: { include: { sports: { select: { sportId: true } } } }, sport: true } })
      if (!service || !service.isActive || !service.trainerProfile.isActive || service.trainerProfile.approvalStatus !== 'APPROVED') {
        throw new BookingPriceError('Trainer or service is not available for booking', 409)
      }
      if (!service.sportId || !service.sport?.isActive || !service.trainerProfile.sports.some(item => item.sportId === service.sportId)) {
        throw new BookingPriceError('This service needs an active sport assigned by the trainer before booking', 409)
      }
      const fees = await effectiveFeeValues(tx)
      const code = normalizeCouponCode(couponCode)
      const coupon = couponCode ? await tx.coupon.findUnique({ where: { code } }) : null
      const parent = coupon?.recipientParentProfileId ? await tx.parentProfile.findUnique({ where: { userId: user.id }, select: { id: true } }) : null
      const price = bookingPrice(service.priceInCents, fees.minBookingAmountCents, service.sportId, Boolean(couponCode), coupon, parent?.id ?? '')
      if (price.totalAmountInCents > 0 && (!service.trainerProfile.stripeAccountId || !service.trainerProfile.stripeOnboardingComplete)) {
        throw new BookingPriceError('Trainer must finish Stripe setup before a paid booking can be reserved.', 409)
      }
      return { serviceOfferingId, couponCode: code, currency: 'usd', ...price }
    }, { isolationLevel: 'RepeatableRead' })
    return NextResponse.json(quote, { headers })
  } catch (error) {
    if (error instanceof BookingPriceError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('Booking quote failed')
    return NextResponse.json({ error: 'Price could not be confirmed. Please retry.' }, { status: 503, headers })
  }
}
