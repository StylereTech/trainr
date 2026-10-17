import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PackagePurchaseError, readPackageOffer } from '@/lib/package-purchases'
import { readPackageCheckoutReview } from '@/lib/package-checkout'
import { packageReviewQuery, packageReviewResponse } from '@/lib/package-sales-schema'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestUser(req)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (actor.role !== 'PARENT') return json({ error: 'Only parents can review package purchases' }, 403)
    const query = new URL(req.url).searchParams
    if (new Set(query.keys()).size !== [...query.keys()].length) return json({ error: 'Invalid package review request' }, 400)
    const input = packageReviewQuery.safeParse(Object.fromEntries(query))
    if (!input.success) return json({ error: 'Invalid package review request' }, 400)
    let purchaseId = 'purchaseId' in input.data ? input.data.purchaseId : undefined
    if ('packageId' in input.data && input.data.requestId) {
      const saved = await prisma.packagePurchase.findFirst({ where: { parentProfile: { userId: actor.id }, requestId: input.data.requestId }, select: { id: true, packageId: true } })
      if (saved && saved.packageId !== input.data.packageId) throw new PackagePurchaseError('Saved checkout does not match this package. Review your purchases.')
      purchaseId = saved?.id
    }
    const result = purchaseId ? await readPackageCheckoutReview(purchaseId, actor.id) : await readPackageOffer(actor.id, 'packageId' in input.data ? input.data.packageId : '')
    return json(packageReviewResponse.parse(result))
  } catch (error) {
    if (error instanceof PackagePurchaseError) return json({ error: error.message }, error.status)
    console.error('Package purchase review unavailable')
    return json({ error: 'Package details could not be loaded. Please retry.' }, 503)
  }
}
