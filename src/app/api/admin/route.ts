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

export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const view = searchParams.get('view') || 'overview'

  if (view === 'overview') {
    const [totalUsers, totalTrainers, totalBookings, totalRevenue] = await Promise.all([
      prisma.user.count(),
      prisma.trainerProfile.count({ where: { approvalStatus: 'APPROVED' } }),
      prisma.booking.count(),
      prisma.payment.aggregate({ _sum: { platformFeeInCents: true }, where: { status: 'SUCCEEDED' } }),
    ])
    const pendingTrainers = await prisma.trainerProfile.count({ where: { approvalStatus: 'PENDING' } })
    const pendingBookings = await prisma.booking.count({ where: { status: 'PENDING' } })
    const recentBookings = await prisma.booking.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        trainerProfile: { select: { firstName: true, lastName: true } },
        parentProfile: { include: { user: { select: { email: true } } } },
        serviceOffering: { select: { title: true } },
      },
    })
    return NextResponse.json({
      stats: { totalUsers, totalTrainers, totalBookings, totalRevenue: totalRevenue._sum.platformFeeInCents || 0, pendingTrainers, pendingBookings },
      recentBookings,
    })
  }

  if (view === 'users') {
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const role = searchParams.get('role')
    const where: any = {}
    if (role) where.role = role
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: {
          parentProfile: { select: { id: true } },
          trainerProfile: { select: { id: true, approvalStatus: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ])
    return NextResponse.json({ users, total })
  }

  if (view === 'trainers-pending') {
    const trainers = await prisma.trainerProfile.findMany({
      where: { approvalStatus: 'PENDING' },
      include: { sports: { include: { sport: true } }, user: { select: { email: true, createdAt: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return NextResponse.json({ trainers })
  }

  if (view === 'bookings') {
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const status = searchParams.get('status')
    const where: any = {}
    if (status) where.status = status
    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          trainerProfile: { select: { firstName: true, lastName: true } },
          parentProfile: { include: { user: { select: { email: true } } } },
          athleteProfile: { select: { firstName: true, lastName: true } },
          serviceOffering: { select: { title: true, priceInCents: true } },
          payment: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.booking.count({ where }),
    ])
    return NextResponse.json({ bookings, total })
  }

  return NextResponse.json({ error: 'Invalid view' }, { status: 400 })
}
