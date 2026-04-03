import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { rateLimit } from '@/lib/rate-limit'

const withdrawSchema = z.object({
  amountInCents: z.number().int().min(500, 'Minimum withdrawal is $5.00'),
})

// POST /api/trainer/wallet/withdraw — Request a withdrawal
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = (session.user as any).id
    const role = (session.user as any).role
    if (role !== 'TRAINER') {
      return NextResponse.json({ error: 'Only trainers can withdraw' }, { status: 403 })
    }

    // Rate limit: 3 withdrawal requests per hour
    const rl = rateLimit(`withdraw:${userId}`, 3, 60 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many withdrawal requests. Please try again later.' },
        { status: 429 }
      )
    }

    const body = await req.json()
    const data = withdrawSchema.parse(body)

    const trainer = await prisma.trainerProfile.findUnique({ where: { userId } })
    if (!trainer) {
      return NextResponse.json({ error: 'Trainer profile not found' }, { status: 404 })
    }

    // Atomic: validate balance + create withdrawal + deduct in one transaction
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.trainerWallet.findUnique({
        where: { trainerProfileId: trainer.id },
      })

      if (!wallet) {
        throw new Error('NO_WALLET')
      }

      if (wallet.availableBalance < data.amountInCents) {
        throw new Error('INSUFFICIENT_BALANCE')
      }

      // Create withdrawal request
      const withdrawal = await tx.withdrawalRequest.create({
        data: {
          walletId: wallet.id,
          amountInCents: data.amountInCents,
          status: 'PENDING',
        },
      })

      // Create ledger entry
      await tx.walletEntry.create({
        data: {
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amountInCents: -data.amountInCents,
          description: `Withdrawal request #${withdrawal.id}`,
        },
      })

      // Move from available to pending
      await tx.trainerWallet.update({
        where: { id: wallet.id },
        data: {
          availableBalance: { decrement: data.amountInCents },
          pendingBalance: { increment: data.amountInCents },
        },
      })

      return withdrawal
    })

    return NextResponse.json({
      withdrawal: result,
      message: `Withdrawal of $${(data.amountInCents / 100).toFixed(2)} requested successfully.`,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    if (error instanceof Error) {
      if (error.message === 'NO_WALLET') {
        return NextResponse.json({ error: 'Wallet not found. Complete a booking first.' }, { status: 404 })
      }
      if (error.message === 'INSUFFICIENT_BALANCE') {
        return NextResponse.json({ error: 'Insufficient available balance' }, { status: 400 })
      }
    }
    console.error('Withdrawal error:', error)
    return NextResponse.json({ error: 'Failed to process withdrawal' }, { status: 500 })
  }
}
