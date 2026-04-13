import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, stripeRuntimeStatus, createConnectedAccount, createAccountLink } from '@/lib/stripe'
import { toAbsoluteAppUrl } from '@/lib/app-url'

// POST /api/trainer/stripe-connect — Start or resume Stripe Connect onboarding
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = (session.user as any).id
    const role = (session.user as any).role
    if (role !== 'TRAINER') return NextResponse.json({ error: 'Only trainers can connect Stripe' }, { status: 403 })

    if (!stripeRuntimeStatus().secretConfigured) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
    }

    const trainer = await prisma.trainerProfile.findUnique({
      where: { userId },
      include: { user: { select: { email: true } } },
    })
    if (!trainer) return NextResponse.json({ error: 'Trainer profile not found' }, { status: 404 })

    let stripeAccountId = trainer.stripeAccountId

    // Create a new Connected Account if none exists
    if (!stripeAccountId) {
      const account = await createConnectedAccount(trainer.id, trainer.user.email)
      stripeAccountId = account.id

      await prisma.trainerProfile.update({
        where: { id: trainer.id },
        data: { stripeAccountId: account.id },
      })
    }

    // Generate an Account Link for onboarding / updating bank details
    const accountLink = await createAccountLink(
      stripeAccountId,
      toAbsoluteAppUrl('/trainer/profile?tab=payouts&stripe=complete'),
      toAbsoluteAppUrl('/trainer/profile?tab=payouts&stripe=refresh')
    )

    return NextResponse.json({ url: accountLink.url })
  } catch (error) {
    console.error('Stripe Connect error:', error)
    return NextResponse.json({ error: 'Failed to start Stripe onboarding' }, { status: 500 })
  }
}

// GET /api/trainer/stripe-connect — Check Stripe Connect status
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const userId = (session.user as any).id
    const role = (session.user as any).role
    if (role !== 'TRAINER') return NextResponse.json({ error: 'Only trainers' }, { status: 403 })

    if (!stripeRuntimeStatus().secretConfigured) {
      return NextResponse.json({ connected: false, stripeConfigured: false })
    }

    const trainer = await prisma.trainerProfile.findUnique({ where: { userId } })
    if (!trainer) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

    if (!trainer.stripeAccountId) {
      return NextResponse.json({ connected: false, stripeConfigured: true, hasAccount: false })
    }

    // Check account status from Stripe
    try {
      const account = await stripe.accounts.retrieve(trainer.stripeAccountId)
      const chargesEnabled = account.charges_enabled
      const payoutsEnabled = account.payouts_enabled
      const detailsSubmitted = account.details_submitted

      // Update local flag if onboarding is complete
      if (detailsSubmitted && !trainer.stripeOnboardingComplete) {
        await prisma.trainerProfile.update({
          where: { id: trainer.id },
          data: { stripeOnboardingComplete: true },
        })
      }

      return NextResponse.json({
        connected: true,
        stripeConfigured: true,
        hasAccount: true,
        chargesEnabled,
        payoutsEnabled,
        detailsSubmitted,
        onboardingComplete: detailsSubmitted,
      })
    } catch {
      return NextResponse.json({ connected: false, stripeConfigured: true, hasAccount: true, error: 'Could not verify account' })
    }
  } catch (error) {
    console.error('Stripe status error:', error)
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 })
  }
}
