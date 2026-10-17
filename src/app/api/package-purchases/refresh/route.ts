import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { packageRefreshRequest } from '@/lib/package-history-schema'
import { refreshPackageHistory } from '@/lib/package-history'
import { PackagePurchaseError } from '@/lib/package-purchases'
import { SettlementConflict } from '@/lib/stripe-settlement'
import { RefundReconciliationError } from '@/lib/stripe-refund-history'
import { stripeRuntimeStatus } from '@/lib/stripe'
import { rateLimit } from '@/lib/rate-limit'

const json = (body: unknown, status = 200, headers = {}) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } })
export const maxDuration = 120
export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestUser(req)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (!['PARENT', 'TRAINER'].includes(actor.role)) return json({ error: 'Forbidden' }, 403)
    const parsed = packageRefreshRequest.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Invalid package payment refresh request' }, 400)
    if (!stripeRuntimeStatus().secretConfigured) return json({ error: 'Stripe is not configured' }, 503)
    const limit = await rateLimit(`package-payment-refresh:${actor.id}`, 5, 60000)
    if (!limit.allowed) return json({ error: limit.unavailable ? 'Payment refresh is temporarily unavailable.' : 'Too many refresh requests. Please wait before retrying.' },
      limit.unavailable ? 503 : 429, { 'Retry-After': String(Math.ceil(limit.resetMs / 1000)) })
    return json(await refreshPackageHistory(actor, parsed.data.purchaseId))
  } catch (error) {
    if (error instanceof PackagePurchaseError || error instanceof RefundReconciliationError) return json({ error: error.message }, error.status)
    if (error instanceof SettlementConflict) return json({ error: error.message }, 409)
    console.error('Package payment refresh unavailable')
    return json({ error: 'Payment refresh could not be verified. Reload purchase history before retrying.' }, 503)
  }
}
