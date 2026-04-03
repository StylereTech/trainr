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

// GET /api/admin/payouts — View payout/earnings data
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const status = searchParams.get('status') || undefined
  const trainerId = searchParams.get('trainerId') || undefined

  const where: any = {}
  if (status) where.status = status
  if (trainerId) where.booking = { trainerProfileId: trainerId }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      include: {
        booking: {
          include: {
            trainerProfile: { select: { firstName: true, lastName: true, stripeAccountId: true, stripeOnboardingComplete: true } },
            parentProfile: { include: { user: { select: { email: true } } } },
            serviceOffering: { select: { title: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.payment.count({ where }),
  ])

  // Summary stats
  const [totalRevenue, totalPlatformFees, totalTrainerPayouts, pendingPayouts] = await Promise.all([
    prisma.payment.aggregate({ _sum: { amountInCents: true }, where: { status: 'SUCCEEDED' } }),
    prisma.payment.aggregate({ _sum: { platformFeeInCents: true }, where: { status: 'SUCCEEDED' } }),
    prisma.payment.aggregate({ _sum: { trainerPayoutInCents: true }, where: { status: 'SUCCEEDED' } }),
    prisma.payment.aggregate({ _sum: { trainerPayoutInCents: true }, where: { status: 'PENDING' } }),
  ])

  return NextResponse.json({
    payments,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    summary: {
      totalRevenue: totalRevenue._sum.amountInCents || 0,
      totalPlatformFees: totalPlatformFees._sum.platformFeeInCents || 0,
      totalTrainerPayouts: totalTrainerPayouts._sum.trainerPayoutInCents || 0,
      pendingPayouts: pendingPayouts._sum.trainerPayoutInCents || 0,
    },
  })
}
