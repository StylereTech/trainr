import { NextRequest, NextResponse } from 'next/server'
import { getServerSession, authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  createAccountLink,
  createConnectedAccount,
  createDashboardLink,
  mapStripeError,
  stripe,
  stripeRuntimeStatus,
} from '@/lib/stripe'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getBaseUrl(request: NextRequest) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
  if (configured) {
    return configured.replace(/\/$/, '')
  }

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3001'
  const proto = request.headers.get('x-forwarded-proto') || (host.includes('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https')
  return `${proto}://${host}`
}

async function getTrainerProfileOrResponse(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { trainerProfile: true },
  })

  if (!user || user.role !== 'TRAINER') {
    return {
      response: NextResponse.json({ error: 'Trainer account required' }, { status: 403 }) as NextResponse,
    }
  }

  if (!user.trainerProfile) {
    return {
      response: NextResponse.json({ error: 'Trainer profile not found' }, { status: 404 }) as NextResponse,
    }
  }

  return {
    user,
    trainerProfile: user.trainerProfile,
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const trainerState = await getTrainerProfileOrResponse(session.user.id)
    if ('response' in trainerState) return trainerState.response

    const runtimeStatus = stripeRuntimeStatus()
    const { trainerProfile } = trainerState

    let chargesEnabled: boolean | null = null
    let payoutsEnabled: boolean | null = null
    let providerError = ''

    if (runtimeStatus.secretConfigured && trainerProfile.stripeAccountId) {
      try {
        const account = await stripe.accounts.retrieve(trainerProfile.stripeAccountId)
        chargesEnabled = account.charges_enabled
        payoutsEnabled = account.payouts_enabled

        const onboardingComplete = Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled)
        if (onboardingComplete !== trainerProfile.stripeOnboardingComplete) {
          await prisma.trainerProfile.update({
            where: { id: trainerProfile.id },
            data: { stripeOnboardingComplete: onboardingComplete },
          })
          trainerProfile.stripeOnboardingComplete = onboardingComplete
        }
      } catch (error) {
        providerError = mapStripeError(error, 'Unable to refresh Stripe account status').detail
      }
    }

    return NextResponse.json({
      providerConfigured: runtimeStatus.secretConfigured,
      publishableKeyConfigured: runtimeStatus.publishableConfigured,
      stripeAccountId: trainerProfile.stripeAccountId,
      stripeOnboardingComplete: trainerProfile.stripeOnboardingComplete,
      chargesEnabled,
      payoutsEnabled,
      providerError,
      dashboardSupported: Boolean(trainerProfile.stripeAccountId && trainerProfile.stripeOnboardingComplete),
      onboardingSupported: runtimeStatus.secretConfigured,
      baseUrl: getBaseUrl(request),
    })
  } catch (error) {
    const normalized = mapStripeError(error, 'Failed to load Stripe payment status')
    return NextResponse.json({ error: normalized.message, detail: normalized.detail }, { status: normalized.status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const runtimeStatus = stripeRuntimeStatus()
    if (!runtimeStatus.secretConfigured) {
      return NextResponse.json({ error: 'Stripe is not configured on this runtime' }, { status: 503 })
    }

    const trainerState = await getTrainerProfileOrResponse(session.user.id)
    if ('response' in trainerState) return trainerState.response

    const { user, trainerProfile } = trainerState
    const baseUrl = getBaseUrl(request)

    let accountId = trainerProfile.stripeAccountId
    let onboardingComplete = trainerProfile.stripeOnboardingComplete

    if (accountId) {
      try {
        const account = await stripe.accounts.retrieve(accountId)
        onboardingComplete = Boolean(account.details_submitted && account.charges_enabled && account.payouts_enabled)

        if (account.type !== 'express' && !onboardingComplete) {
          const replacement = await createConnectedAccount(user.id, user.email)
          accountId = replacement.id
          onboardingComplete = false
          await prisma.trainerProfile.update({
            where: { id: trainerProfile.id },
            data: {
              stripeAccountId: replacement.id,
              stripeOnboardingComplete: false,
            },
          })
        } else if (onboardingComplete !== trainerProfile.stripeOnboardingComplete) {
          await prisma.trainerProfile.update({
            where: { id: trainerProfile.id },
            data: { stripeOnboardingComplete: onboardingComplete },
          })
        }
      } catch (error) {
        const normalized = mapStripeError(error, 'Unable to refresh Stripe account')

        if (normalized.message === 'Trainer payment account needs reconnection before checkout can continue') {
          accountId = null
          onboardingComplete = false
          await prisma.trainerProfile.update({
            where: { id: trainerProfile.id },
            data: {
              stripeAccountId: null,
              stripeOnboardingComplete: false,
            },
          })
        } else {
          return NextResponse.json({ error: normalized.message, detail: normalized.detail }, { status: normalized.status })
        }
      }
    }

    if (!accountId) {
      const account = await createConnectedAccount(user.id, user.email)
      accountId = account.id
      onboardingComplete = false
      await prisma.trainerProfile.update({
        where: { id: trainerProfile.id },
        data: {
          stripeAccountId: account.id,
          stripeOnboardingComplete: false,
        },
      })
    }

    if (onboardingComplete) {
      const dashboardLink = await createDashboardLink(accountId)
      return NextResponse.json({
        dashboardUrl: dashboardLink.url,
        stripeAccountId: accountId,
        stripeOnboardingComplete: true,
      })
    }

    const accountLink = await createAccountLink(
      accountId,
      `${baseUrl}/trainer/dashboard?stripe=complete`,
      `${baseUrl}/trainer/dashboard?stripe=refresh`,
    )

    return NextResponse.json({
      onboardingUrl: accountLink.url,
      stripeAccountId: accountId,
      stripeOnboardingComplete: false,
    })
  } catch (error) {
    const normalized = mapStripeError(error, 'Failed to create Stripe account link')
    return NextResponse.json({ error: normalized.message, detail: normalized.detail }, { status: normalized.status })
  }
}
