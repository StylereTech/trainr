import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { calculateSplit, calculateDiscount } from '@/lib/fees'
import { isTimeSlotAvailable, minutesToTime, timeToMinutes } from '@/lib/availability'

const bookingCreateSchema = z.object({
  serviceOfferingId: z.string().min(1),
  athleteProfileId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:MM'),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const role = (session.user as any).role
    if (role !== 'PARENT') {
      return NextResponse.json({ error: 'Only parents can create bookings' }, { status: 403 })
    }

    const body = await req.json()
    const data = bookingCreateSchema.parse(body)

    // Get parent profile WITH user info for notification
    const parent = await prisma.parentProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    })
    if (!parent) {
      return NextResponse.json({ error: 'Parent profile not found' }, { status: 404 })
    }

    // Verify athlete belongs to parent
    const athlete = await prisma.athleteProfile.findFirst({
      where: { id: data.athleteProfileId, parentProfileId: parent.id },
    })
    if (!athlete) {
      return NextResponse.json({ error: 'Athlete not found' }, { status: 404 })
    }

    // Get service offering with trainer info
    const service = await prisma.serviceOffering.findUnique({
      where: { id: data.serviceOfferingId },
      include: { trainerProfile: true },
    })
    if (!service || !service.isActive) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 })
    }

    const bookingDate = new Date(data.date)

    // --- AVAILABILITY VALIDATION ---
    const trainerSlots = await prisma.availabilitySlot.findMany({
      where: {
        trainerProfileId: service.trainerProfileId,
        isAvailable: true,
      },
    })

    if (!isTimeSlotAvailable(trainerSlots, bookingDate, data.startTime, service.durationMinutes)) {
      return NextResponse.json(
        { error: 'Trainer is not available at the requested date/time' },
        { status: 400 }
      )
    }

    // --- DOUBLE-BOOKING CHECK ---
    // Check for overlapping bookings (not just exact startTime match)
    const requestedStartMin = timeToMinutes(data.startTime)
    const requestedEndMin = requestedStartMin + service.durationMinutes
    const endTime = minutesToTime(requestedEndMin)

    const conflictingBookings = await prisma.booking.findMany({
      where: {
        trainerProfileId: service.trainerProfileId,
        date: bookingDate,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      select: { startTime: true, endTime: true },
    })

    const hasConflict = conflictingBookings.some((existing: any) => {
      const existStart = timeToMinutes(existing.startTime)
      const existEnd = timeToMinutes(existing.endTime)
      return requestedStartMin < existEnd && requestedEndMin > existStart
    })

    if (hasConflict) {
      return NextResponse.json({ error: 'This time slot overlaps with an existing booking' }, { status: 409 })
    }

    // --- FEE CALCULATION (centralized) ---
    const grossAmount = service.priceInCents

    // --- COUPON (atomic race-safe) ---
    let discount = 0
    if (data.couponCode) {
      const couponResult = await prisma.$transaction(async (tx: any) => {
        const coupon = await tx.coupon.findUnique({ where: { code: data.couponCode! } })
        if (
          !coupon ||
          !coupon.isActive ||
          coupon.currentUses >= coupon.maxUses ||
          (coupon.expiresAt && new Date(coupon.expiresAt) <= new Date())
        ) {
          return null
        }
        // Atomic increment with WHERE guard — prevents race condition
        const updated = await tx.coupon.updateMany({
          where: { code: data.couponCode!, currentUses: { lt: coupon.maxUses } },
          data: { currentUses: { increment: 1 } },
        })
        if (updated.count === 0) return null
        return coupon
      })

      if (couponResult) {
        discount = calculateDiscount(
          grossAmount,
          couponResult.discountPercent,
          couponResult.discountAmountInCents
        )
      }
    }

    const finalAmount = Math.max(grossAmount - discount, 0)
    const { platformFee, trainerShare } = calculateSplit(finalAmount)

    // --- CREATE BOOKING ---
    const booking = await prisma.booking.create({
      data: {
        parentProfileId: parent.id,
        trainerProfileId: service.trainerProfileId,
        athleteProfileId: athlete.id,
        serviceOfferingId: service.id,
        date: bookingDate,
        startTime: data.startTime,
        endTime,
        totalAmountInCents: finalAmount,
        platformFeeInCents: platformFee,
        trainerPayoutInCents: trainerShare,
        notes: data.notes,
        status: 'PENDING',
      },
      include: {
        serviceOffering: true,
        trainerProfile: { include: { sports: { include: { sport: true } } } },
        athleteProfile: true,
      },
    })

    // --- NOTIFICATION (human-readable, not parent.id) ---
    const parentDisplayName = parent.user.email
    await prisma.notification.create({
      data: {
        userId: service.trainerProfile.userId,
        type: 'BOOKING_REQUEST',
        title: 'New Booking Request',
        message: `New booking from ${parentDisplayName} for ${service.title} on ${bookingDate.toLocaleDateString()} at ${data.startTime}.`,
        data: { bookingId: booking.id },
      },
    })

    return NextResponse.json(booking, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Booking error:', error)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const role = (session.user as any).role
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    let where: any = {}
    if (role === 'PARENT') {
      const parent = await prisma.parentProfile.findUnique({ where: { userId } })
      if (!parent) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      where.parentProfileId = parent.id
    } else if (role === 'TRAINER') {
      const trainer = await prisma.trainerProfile.findUnique({ where: { userId } })
      if (!trainer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      where.trainerProfileId = trainer.id
    }

    if (status) where.status = status

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          serviceOffering: true,
          trainerProfile: { include: { sports: { include: { sport: true } } } },
          parentProfile: { include: { user: true } },
          athleteProfile: true,
          payment: true,
          review: true,
        },
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ])

    return NextResponse.json({ bookings, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } })
  } catch (error) {
    console.error('Get bookings error:', error)
    return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
  }
}
