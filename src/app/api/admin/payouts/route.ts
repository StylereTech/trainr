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

// PATCH /api/admin/payouts — Update withdrawal status
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { withdrawalId, action, reason } = body

  if (!withdrawalId || !action) {
    return NextResponse.json({ error: 'withdrawalId and action required' }, { status: 400 })
  }

  const withdrawal = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: { wallet: true },
  })

  if (!withdrawal) {
    return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
  }

  switch (action) {
    case 'approve': {
      if (withdrawal.status !== 'PENDING') {
        return NextResponse.json({ error: 'Can only approve pending withdrawals' }, { status: 400 })
      }
      await prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { status: 'APPROVED' },
      })
      break
    }

    case 'process': {
      if (withdrawal.status !== 'APPROVED') {
        return NextResponse.json({ error: 'Can only process approved withdrawals' }, { status: 400 })
      }
      await prisma.withdrawalRequest.update({
        where: { id: withdrawalId },
        data: { status: 'PROCESSING' },
      })
      break
    }

    case 'complete': {
      if (withdrawal.status !== 'PROCESSING') {
        return NextResponse.json({ error: 'Can only complete processing withdrawals' }, { status: 400 })
      }
      await prisma.$transaction(async (tx) => {
        await tx.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: { status: 'PAID', processedAt: new Date() },
        })
        // Move from pending to withdrawn
        await tx.trainerWallet.update({
          where: { id: withdrawal.walletId },
          data: {
            pendingBalance: { decrement: withdrawal.amountInCents },
            withdrawnTotal: { increment: withdrawal.amountInCents },
          },
        })
      })
      break
    }

    case 'fail': {
      if (!['APPROVED', 'PROCESSING'].includes(withdrawal.status)) {
        return NextResponse.json({ error: 'Invalid status for failure' }, { status: 400 })
      }
      await prisma.$transaction(async (tx) => {
        await tx.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: { status: 'FAILED', failureReason: reason || 'Payout failed' },
        })
        // Return funds to available balance
        await tx.trainerWallet.update({
          where: { id: withdrawal.walletId },
          data: {
            pendingBalance: { decrement: withdrawal.amountInCents },
            availableBalance: { increment: withdrawal.amountInCents },
          },
        })
        // Reversal ledger entry
        await tx.walletEntry.create({
          data: {
            walletId: withdrawal.walletId,
            type: 'ADJUSTMENT',
            amountInCents: withdrawal.amountInCents,
            description: `Withdrawal #${withdrawalId} failed — funds returned`,
          },
        })
      })
      break
    }

    case 'cancel': {
      if (withdrawal.status !== 'PENDING') {
        return NextResponse.json({ error: 'Can only cancel pending withdrawals' }, { status: 400 })
      }
      await prisma.$transaction(async (tx) => {
        await tx.withdrawalRequest.update({
          where: { id: withdrawalId },
          data: { status: 'CANCELLED' },
        })
        // Return funds to available
        await tx.trainerWallet.update({
          where: { id: withdrawal.walletId },
          data: {
            pendingBalance: { decrement: withdrawal.amountInCents },
            availableBalance: { increment: withdrawal.amountInCents },
          },
        })
        // Reversal ledger entry
        await tx.walletEntry.create({
          data: {
            walletId: withdrawal.walletId,
            type: 'ADJUSTMENT',
            amountInCents: withdrawal.amountInCents,
            description: `Withdrawal #${withdrawalId} cancelled — funds returned`,
          },
        })
      })
      break
    }

    default:
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const updated = await prisma.withdrawalRequest.findUnique({
    where: { id: withdrawalId },
    include: { wallet: { include: { trainerProfile: { select: { firstName: true, lastName: true } } } } },
  })

  return NextResponse.json(updated)
}
