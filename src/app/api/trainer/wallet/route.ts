import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { stripe, stripeRuntimeStatus } from '@/lib/stripe'
import { payoutHistoryQuery, payoutHistorySchema } from '@/lib/payout-contract'

export const dynamic = 'force-dynamic'

// Destination charges settle in Stripe, not in TRAINR's legacy wallet ledger.
export async function GET(req: Request) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'TRAINER') {
      return NextResponse.json({ error: 'Only trainers can access payouts' }, { status: 403 })
    }
    const query = new URL(req.url).searchParams
    const parsed = payoutHistoryQuery.safeParse(Object.fromEntries(query))
    if (!parsed.success || new Set(query.keys()).size !== Array.from(query.keys()).length) {
      return NextResponse.json({ error: 'Invalid payout history cursor' }, { status: 400 })
    }
    const trainer = await prisma.trainerProfile.findUnique({ where: { userId: session.user.id } })
    if (!trainer) return NextResponse.json({ error: 'Trainer profile not found' }, { status: 404 })
    if (!stripeRuntimeStatus().secretConfigured) {
      return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
    }
    if (!trainer.stripeAccountId) {
      return NextResponse.json({ source: 'stripe', connected: false, wallet: null, payouts: [], schedule: null, hasMore: false, nextCursor: null }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    const providerOptions = { timeout: 10000, maxNetworkRetries: 0 }
    const options = { stripeAccount: trainer.stripeAccountId, ...providerOptions }
    const [balance, payouts, account] = await Promise.all([
      stripe.balance.retrieve({}, options),
      stripe.payouts.list({ limit: 20, ...(parsed.data.startingAfter ? { starting_after: parsed.data.startingAfter } : {}) }, options),
      stripe.accounts.retrieve(trainer.stripeAccountId, {}, providerOptions),
    ])
    if (account.id !== trainer.stripeAccountId || (parsed.data.startingAfter && payouts.data.some(payout => payout.id === parsed.data.startingAfter))) {
      throw new Error('Unverified payout history identity')
    }
    const usdBalance = (amounts: typeof balance.available) => amounts
      .filter((item) => item.currency === 'usd').reduce((total, item) => total + item.amount, 0)

    return NextResponse.json(payoutHistorySchema.parse({
      source: 'stripe',
      connected: true,
      currency: 'usd',
      wallet: { availableBalance: usdBalance(balance.available), pendingBalance: usdBalance(balance.pending) },
      schedule: account.settings?.payouts?.schedule ?? null,
      payouts: payouts.data.map((payout) => ({
        id: payout.id, amountInCents: payout.amount, currency: payout.currency,
        status: payout.status, arrivalDate: payout.arrival_date, createdAt: payout.created,
      })),
      hasMore: payouts.has_more,
      nextCursor: payouts.has_more ? payouts.data.at(-1)?.id ?? null : null,
    }), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Stripe payout status failed:', error instanceof Error ? error.name : 'Unknown error')
    return NextResponse.json({ error: 'Unable to load Stripe balances and payouts. Please try again.' }, { status: 503 })
  }
}
