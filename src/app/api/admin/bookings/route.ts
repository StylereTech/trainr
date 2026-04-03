import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUserId = session.user.id
  const body = await req.json()
  const { bookingId, action, reason } = body

  if (!bookingId || !action) return NextResponse.json({ error: 'bookingId and action required' }, { status: 400 })

  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { trainerProfile: true, parentProfile: true },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  let updateData: any = {}
  const validActions: Record<string, string> = {
    confirm: 'CONFIRMED',
    complete: 'COMPLETED',
    cancel: 'CANCELLED',
    no_show: 'NO_SHOW',
  }

  if (!validActions[action]) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  updateData.status = validActions[action]
  if (action === 'cancel') updateData.cancellationReason = reason || 'Cancelled by admin'

  const updated = await prisma.booking.update({ where: { id: bookingId }, data: updateData })

  await prisma.adminAction.create({
    data: {
      adminUserId,
      actionType: `BOOKING_${action.toUpperCase()}`,
      targetType: 'BOOKING',
      targetId: bookingId,
      description: `Admin ${action} booking ${bookingId}`,
      metadata: { reason: reason || null },
    },
  })

  return NextResponse.json(updated)
}
