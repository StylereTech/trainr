import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getRequestUser } from '@/lib/auth'
import { applyBookingAction, BookingActionError, bookingActionSchema } from '@/lib/booking-actions'
import { z } from 'zod'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (session.user.role !== 'ADMIN') return null
  return session
}

// GET /api/admin/bookings — List bookings with admin-level detail
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const status = searchParams.get('status') || undefined
  const trainerId = searchParams.get('trainerId') || undefined
  const dateFrom = searchParams.get('dateFrom') || undefined
  const dateTo = searchParams.get('dateTo') || undefined

  const where: any = {}
  if (status) where.status = status
  if (trainerId) where.trainerProfileId = trainerId
  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) where.date.gte = new Date(dateFrom)
    if (dateTo) where.date.lte = new Date(dateTo)
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        trainerProfile: { select: { firstName: true, lastName: true, slug: true } },
        parentProfile: { include: { user: { select: { email: true } } } },
        athleteProfile: { select: { firstName: true, lastName: true } },
        serviceOffering: { select: { title: true, priceInCents: true } },
        payment: true,
        review: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ])

  return NextResponse.json({
    bookings,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

// PATCH /api/admin/bookings — Admin booking actions
export async function PATCH(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const input = bookingActionSchema.extend({ bookingId: z.string().trim().min(1).max(128) }).safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: 'Invalid booking action or reason' }, { status: 400 })
    return NextResponse.json(await applyBookingAction(input.data.bookingId, user, input.data))
  } catch (error) {
    if (error instanceof BookingActionError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Admin booking action transaction failed')
    return NextResponse.json({ error: 'Failed to update booking. Refresh before retrying.' }, { status: 503 })
  }
}
