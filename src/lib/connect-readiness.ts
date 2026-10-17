import { prisma } from '@/lib/prisma'
import { stripe } from '@/lib/stripe'
import { isStripeAccountReady } from '@/lib/stripe-account'

// Every readiness writer reads Stripe after acquiring the same profile locks.
// This prevents delayed events and concurrent status reads from restoring stale flags.
export async function refreshConnectReadiness(accountId: string) {
  if (typeof accountId !== 'string' || !accountId.startsWith('acct_') || accountId.length <= 5) throw new Error('Invalid connected account identity')
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM trainer_profiles WHERE "stripeAccountId" = ${accountId} ORDER BY id FOR UPDATE`
    const trainer = await tx.trainerProfile.findFirst({ where: { stripeAccountId: accountId }, select: { id: true } })
    if (!trainer) return null
    const account = await stripe.accounts.retrieve(accountId, {}, { timeout: 4000, maxNetworkRetries: 0 })
    if (account.id !== accountId) throw new Error('Connected account lookup returned a different identity')
    await tx.trainerProfile.updateMany({ where: { stripeAccountId: accountId }, data: { stripeOnboardingComplete: isStripeAccountReady(account) } })
    return account
  }, { maxWait: 5000, timeout: 10000 })
}
