import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { isStripeAccountReady } from '@/lib/stripe-account'
import { createAccountLink, createDashboardLink, stripeRuntimeStatus } from '@/lib/stripe'
import { toAbsoluteAppUrl } from '@/lib/app-url'
import { ConnectAccountError, currentConnectTrainer, ensureConnectAccount, verifiedConnectAccount } from '@/lib/connect-accounts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
const failure = (error: unknown) => error instanceof ConnectAccountError ? json({ error: error.message }, error.status) : json({ error: 'Unable to verify Stripe setup. Please retry; your existing account has not been replaced.' }, 503)

export async function GET(request: NextRequest) {
  try {
    const actor = await getRequestUser(request)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (actor.role !== 'TRAINER') return json({ error: 'Trainer account required' }, 403)
    const trainer = await currentConnectTrainer(actor.id)
    const runtime = stripeRuntimeStatus()
    const result = { providerConfigured: runtime.secretConfigured, publishableKeyConfigured: runtime.publishableConfigured,
      stripeAccountId: trainer.stripeAccountId, stripeOnboardingComplete: false, chargesEnabled: null as boolean | null,
      payoutsEnabled: null as boolean | null, detailsSubmitted: null as boolean | null, providerError: '', dashboardSupported: false,
      onboardingSupported: runtime.secretConfigured && !trainer.stripeAccountId }
    if (runtime.secretConfigured && trainer.stripeAccountId) {
      try {
        const account = await verifiedConnectAccount(actor.id, trainer.stripeAccountId)
        result.chargesEnabled = account.charges_enabled
        result.payoutsEnabled = account.payouts_enabled
        result.detailsSubmitted = account.details_submitted
        result.stripeOnboardingComplete = isStripeAccountReady(account)
        result.dashboardSupported = account.type === 'express' && result.stripeOnboardingComplete
        result.onboardingSupported = account.type === 'express' && !result.stripeOnboardingComplete
        if (account.type !== 'express') result.providerError = 'This Stripe account requires support for dashboard access. Its identity has been preserved.'
      } catch (error) {
        if (error instanceof ConnectAccountError && error.status === 403) throw error
        result.providerError = 'Current Stripe status could not be verified. Retry or contact support; your existing account has been preserved.'
      }
    }
    return json(result)
  } catch (error) { return failure(error) }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await getRequestUser(request)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (actor.role !== 'TRAINER') return json({ error: 'Trainer account required' }, 403)
    if (!stripeRuntimeStatus().secretConfigured) return json({ error: 'Stripe is not configured on this runtime' }, 503)
    const initial = await currentConnectTrainer(actor.id)
    const accountId = await ensureConnectAccount(actor.id)
    const account = await verifiedConnectAccount(actor.id, accountId)
    if (account.type !== 'express') throw new ConnectAccountError('This existing Stripe account requires support. Automatic replacement is disabled.')
    const ready = isStripeAccountReady(account)
    const link = ready ? await createDashboardLink(accountId) : await createAccountLink(accountId,
      toAbsoluteAppUrl('/trainer/dashboard?stripe=complete'), toAbsoluteAppUrl('/trainer/dashboard?stripe=refresh'))
    const current = await currentConnectTrainer(actor.id)
    if (current.stripeAccountId !== accountId || current.user.sessionVersion !== initial.user.sessionVersion) throw new ConnectAccountError('Account access changed. Reload before continuing.')
    return json({ [ready ? 'dashboardUrl' : 'onboardingUrl']: link.url, stripeAccountId: accountId, stripeOnboardingComplete: ready })
  } catch (error) { return failure(error) }
}
