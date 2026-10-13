import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { PackageOfferChangedError, PackagePurchaseError, preparePackagePurchase } from '@/lib/package-purchases'
import { startOrResumePackageCheckout } from '@/lib/package-checkout'
import { packageCheckoutRequest, packageCheckoutResponse } from '@/lib/package-sales-schema'
import { stripeRuntimeStatus } from '@/lib/stripe'
import { SettlementConflict } from '@/lib/stripe-settlement'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const maxDuration = 120
const json = (body: unknown, status = 200, headers = {}) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'private, no-store', ...headers },
})

export async function POST(req: NextRequest) {
  try {
    const actor = await getRequestUser(req)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (actor.role !== 'PARENT') return json({ error: 'Only parents can purchase packages' }, 403)
    const parsed = packageCheckoutRequest.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return json({ error: 'Invalid package checkout request' }, 400)
    const configured = stripeRuntimeStatus()
    if (!configured.secretConfigured || !configured.webhookConfigured) return json({ error: 'Package payments are not configured' }, 503)
    const limit = await rateLimit(`package-checkout:${actor.id}`, 5, 60000)
    if (!limit.allowed) return json({ error: limit.unavailable ? 'Package checkout is temporarily unavailable.' : 'Too many checkout requests. Wait before retrying the same request.' },
      limit.unavailable ? 503 : 429, { 'Retry-After': String(Math.ceil(limit.resetMs / 1000)) })
    const purchaseId = 'purchaseId' in parsed.data ? parsed.data.purchaseId : (await preparePackagePurchase(actor.id, parsed.data)).id
    const result = await startOrResumePackageCheckout(purchaseId, actor.id)
    return json(packageCheckoutResponse.parse(result))
  } catch (error) {
    if (error instanceof PackageOfferChangedError) return json({ error: error.message, code: 'OFFER_CHANGED' }, 409)
    if (error instanceof PackagePurchaseError) return json({ error: error.message }, error.status)
    if (error instanceof SettlementConflict) return json({ error: error.message }, 409)
    console.error('Package checkout could not be verified')
    return json({ error: 'Checkout could not be verified. Retry the same request or review your package purchases before starting another purchase.' }, 503)
  }
}
