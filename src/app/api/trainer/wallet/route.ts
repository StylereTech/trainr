import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/trainer/wallet — Get trainer's wallet balance and recent entries
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const role = (session.user as any).role
    if (role !== 'TRAINER') {
      return NextResponse.json({ error: 'Only trainers can access wallet' }, { status: 403 })
    }

    const trainer = await prisma.trainerProfile.findUnique({ where: { userId } })
    if (!trainer) {
      return NextResponse.json({ error: 'Trainer profile not found' }, { status: 404 })
    }

    // Get or create wallet
    let wallet = await prisma.trainerWallet.findUnique({
      where: { trainerProfileId: trainer.id },
    })

    if (!wallet) {
      wallet = await prisma.trainerWallet.create({
        data: { trainerProfileId: trainer.id },
      })
    }

    // Get recent entries
    const entries = await prisma.walletEntry.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        booking: {
          select: { id: true, date: true, startTime: true, serviceOffering: { select: { title: true } } },
        },
      },
    })

    // Get pending withdrawals
    const pendingWithdrawals = await prisma.withdrawalRequest.findMany({
      where: { walletId: wallet.id, status: { in: ['PENDING', 'APPROVED', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({
      wallet: {
        availableBalance: wallet.availableBalance,
        pendingBalance: wallet.pendingBalance,
        withdrawnTotal: wallet.withdrawnTotal,
        totalEarned: wallet.availableBalance + wallet.pendingBalance + wallet.withdrawnTotal,
      },
      entries,
      pendingWithdrawals,
    })
  } catch (error) {
    console.error('Wallet GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch wallet' }, { status: 500 })
  }
}
