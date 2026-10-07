import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if ((session.user as any).role !== 'ADMIN') return null
  return session
}

// GET /api/admin/payouts — List all withdrawal requests
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')
  const page = Number(searchParams.get('page') || '1')
  const limit = Number(searchParams.get('limit') || '20')
  const view = searchParams.get('view') || 'legacy'
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger((page - 1) * limit)) {
    return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 })
  }
  if (!['payments', 'legacy'].includes(view)) {
    return NextResponse.json({ error: 'Invalid payout view' }, { status: 400 })
  }
  const statuses = view === 'payments'
    ? ['PENDING', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED']
    : ['PENDING', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED']
  if (status && !statuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const where: any = {}
  if (status) where.status = status

  if (view === 'payments') {
    try {
      const [payments, total, captured, pending] = await Promise.all([
        prisma.payment.findMany({
          where,
          include: { booking: { select: {
            trainerProfile: { select: { firstName: true, lastName: true, stripeAccountId: true, stripeOnboardingComplete: true } },
            parentProfile: { select: { user: { select: { email: true } } } },
            serviceOffering: { select: { title: true } },
          } } },
          orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
        }),
        prisma.payment.count({ where }),
        prisma.payment.aggregate({
          where: { status: { in: ['SUCCEEDED', 'REFUNDED', 'PARTIALLY_REFUNDED'] } },
          _sum: { amountInCents: true, refundAmountInCents: true },
        }),
        prisma.payment.aggregate({
          where: { status: { in: ['PENDING', 'PROCESSING'] } },
          _sum: { amountInCents: true },
        }),
      ])
      const grossCaptured = captured._sum.amountInCents ?? 0
      const recordedRefunds = captured._sum.refundAmountInCents ?? 0
      return NextResponse.json({
        payments,
        summary: { grossCaptured, recordedRefunds, netCaptured: grossCaptured - recordedRefunds, awaitingPayment: pending._sum.amountInCents ?? 0 },
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      }, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch {
      return NextResponse.json({ error: 'Unable to load recorded payments' }, { status: 503 })
    }
  }

  const [withdrawals, total] = await Promise.all([
    prisma.withdrawalRequest.findMany({
      where,
      include: {
        wallet: {
          include: {
            trainerProfile: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                stripeAccountId: true,
                stripeOnboardingComplete: true,
                user: { select: { email: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.withdrawalRequest.count({ where }),
  ])

  return NextResponse.json({
    withdrawals,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

// Legacy ledger records remain readable until reconciled against Stripe.
export async function PATCH(_req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({
    error: 'Legacy wallet payouts are read-only. Reconcile existing requests with Stripe transfers and bank payouts before any manual disbursement.',
    code: 'STRIPE_MANAGED_PAYOUTS',
  }, { status: 409 })
}
