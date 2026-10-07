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
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')

  const where: any = {}
  if (status) where.status = status

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
