import { NextRequest, NextResponse } from 'next/server'
import { BookingStatus, Prisma } from '@prisma/client'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { bookingSchema } from '@/lib/validations'
import { BookingCreationError, createBooking } from '@/lib/booking-creation'
import { creditBookingInclude, packageCreditFunding } from '@/lib/package-credit-booking-hold'
import { readPackageReviewHolds } from '@/lib/package-review-presence'
import { readPaymentReviewHolds } from '@/lib/payment-review-presence'

export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Only parents can create bookings' }, { status: 403 })
    const input = bookingSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: input.error.errors[0].message }, { status: 400 })
    return NextResponse.json(await createBooking(user.id, input.data), { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof BookingCreationError) return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } })
    console.error('Booking transaction failed')
    return NextResponse.json({ error: 'Booking could not be confirmed. Retry the same request or check your dashboard.' }, { status: 503 })
  }
}

const listQuery = z.object({
  status: z.nativeEnum(BookingStatus).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
})

export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const role = user.role
    if (!role || !['PARENT', 'TRAINER', 'ADMIN'].includes(role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const query = new URL(req.url).searchParams
    const input = listQuery.safeParse({ status: query.get('status') || undefined, page: query.get('page') ?? undefined, limit: query.get('limit') ?? undefined })
    if (!input.success) return NextResponse.json({ error: 'Invalid booking filter or pagination' }, { status: 400 })
    const { status, page, limit } = input.data
    const where: Prisma.BookingWhereInput = {}
    if (role === 'PARENT') {
      const parent = await prisma.parentProfile.findUnique({ where: { userId: user.id } })
      if (!parent) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      where.parentProfileId = parent.id
    } else if (role === 'TRAINER') {
      const trainer = await prisma.trainerProfile.findUnique({ where: { userId: user.id } })
      if (!trainer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      where.trainerProfileId = trainer.id
    }
    if (status) where.status = status
    const payload = await prisma.$transaction(async tx => {
      const [bookings, total] = await Promise.all([
        tx.booking.findMany({
          where,
          include: {
            ...creditBookingInclude,
            serviceOffering: true,
            trainerProfile: { include: { sports: { include: { sport: true } } } },
            parentProfile: { include: { user: { select: { id: true, email: true } } } },
            athleteProfile: true, payment: true, review: true,
          },
          orderBy: [{ date: 'desc' }, { startTime: 'asc' }, { id: 'asc' }],
          skip: (page - 1) * limit, take: limit,
        }),
        tx.booking.count({ where }),
      ])
      const held = await readPackageReviewHolds(tx, bookings.flatMap(booking => booking.creditRedemption ? [booking.creditRedemption.purchaseId] : []))
      const paymentHeld = await readPaymentReviewHolds(tx, bookings.filter(booking => booking.payment).map(booking => booking.id))
      return { bookings: bookings.map(({ creditRedemption, ...booking }) => ({ ...booking,
        creditFunding: packageCreditFunding({ ...booking, creditRedemption }, held.has(creditRedemption?.purchaseId || '')),
        payment: booking.payment ? { ...booking.payment, financialReview: role === 'ADMIN'
          ? paymentHeld.has(booking.id) ? booking.payment.financialReview || true : null
          : paymentHeld.has(booking.id) } : null,
      })), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead })
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    console.error('Booking read failed')
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 503 })
  }
}
