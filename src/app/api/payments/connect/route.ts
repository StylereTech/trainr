import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createConnectedAccount, createAccountLink, stripeRuntimeStatus } from '@/lib/stripe'
import { toAbsoluteAppUrl } from '@/lib/app-url'

// POST /api/payments/connect — Initiate Stripe Connect onboarding for trainer
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    const role = session.user.role
    if (role !== 'TRAINER') {
      return NextResponse.json({ error: 'Only trainers can set up payments' }, { status: 403 })
    }

    if (!stripeRuntimeStatus().secretConfigured) {
      return NextResponse.json({ error: 'Stripe is not configured on this runtime' }, { status: 503 })
    }

    const trainer = await prisma.trainerProfile.findUnique({
      where: { userId },
    })
    if (!trainer) {
      return NextResponse.json({ error: 'Trainer profile not found' }, { status: 404 })
    }

    let accountId = trainer.stripeAccountId

    // Create Stripe Connect account if not exists
    if (!accountId) {
      const user = await prisma.user.findUnique({ where: { id: userId } })
      const account = await createConnectedAccount(trainer.id, user!.email)
      accountId = account.id

      await prisma.trainerProfile.update({
        where: { id: trainer.id },
        data: { stripeAccountId: accountId },
      })
    }

    // Create onboarding link
    const accountLink = await createAccountLink(
      accountId,
      toAbsoluteAppUrl('/trainer/dashboard?stripe=complete'),
      toAbsoluteAppUrl('/trainer/dashboard?stripe=refresh'),
    )

    return NextResponse.json({ url: accountLink.url })
  } catch (error: any) {
    console.error('Stripe Connect error:', error)
    return NextResponse.json({ error: 'Failed to set up payments', debug: error?.message || String(error) }, { status: 500 })
  }
}
