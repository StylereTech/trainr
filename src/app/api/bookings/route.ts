import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const bookingCreateSchema = z.object({
  serviceOfferingId: z.string().min(1),
  athleteProfileId: z.string().min(1),
  date: z.string().min(1),
  startTime: z.string().min(1),
  notes: z.string().optional(),
  couponCode: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const role = session.user.role
    if (role !== 'PARENT') {
      return NextResponse.json({ error: 'Only parents can create bookings' }, { status: 403 })
    }

    const body = await req.json()
    const data = bookingCreateSchema.parse(body)

    // Get parent profile
    const parent = await prisma.parentProfile.findUnique({ where: { userId } })
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

    // Check for time conflicts
    const existingBooking = await prisma.booking.findFirst({
      where: {
        trainerProfileId: service.trainerProfileId,
        date: new Date(data.date),
        startTime: data.startTime,
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    })
    if (existingBooking) {
      return NextResponse.json({ error: 'This time slot is already booked' }, { status: 409 })
    }

    // Calculate fees
    const totalAmount = service.priceInCents
    const platformFee = Math.round(totalAmount * 0.15)
    const processingFee = Math.round(totalAmount * 0.029 + 30)
    const trainerPayout = totalAmount - platformFee

    // Check coupon
    let discount = 0
    if (data.couponCode) {
      const coupon = await prisma.coupon.findUnique({ where: { code: data.couponCode } })
      if (coupon && coupon.isActive && coupon.currentUses < coupon.maxUses && (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date())) {
        discount = coupon.discountPercent
          ? Math.round(totalAmount * coupon.discountPercent / 100)
          : (coupon.discountAmountInCents || 0)
        await prisma.coupon.update({ where: { code: data.couponCode }, data: { currentUses: { increment: 1 } } })
      }
    }

    const finalAmount = totalAmount - discount
    const finalPlatformFee = Math.round(finalAmount * 0.15)
    const finalTrainerPayout = finalAmount - finalPlatformFee

    // Calculate end time
    const [startH, startM] = data.startTime.split(':').map(Number)
    const endMinutes = startH * 60 + startM + service.durationMinutes
    const endH = Math.floor(endMinutes / 60)
    const endM = endMinutes % 60
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        parentProfileId: parent.id,
        trainerProfileId: service.trainerProfileId,
        athleteProfileId: athlete.id,
        serviceOfferingId: service.id,
        date: new Date(data.date),
        startTime: data.startTime,
        endTime,
        totalAmountInCents: finalAmount,
        platformFeeInCents: finalPlatformFee,
        trainerPayoutInCents: finalTrainerPayout,
        notes: data.notes,
        status: 'PENDING',
      },
      include: {
        serviceOffering: true,
        trainerProfile: { include: { sports: { include: { sport: true } } } },
        athleteProfile: true,
      },
    })

    // Create notification for trainer
    await prisma.notification.create({
      data: {
        userId: service.trainerProfile.userId,
        type: 'BOOKING_REQUEST',
        title: 'New Booking Request',
        message: `You have a new booking request from ${parent.id} for ${service.title} on ${new Date(data.date).toLocaleDateString()}.`,
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

    const userId = session.user.id
    const role = session.user.role
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
