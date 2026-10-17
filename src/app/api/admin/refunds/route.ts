import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { stripeRuntimeStatus } from '@/lib/stripe'
import { reconcilePaymentRefunds, RefundReconciliationError } from '@/lib/refund-reconciliation'

const schema = z.object({ bookingId: z.string().trim().min(1).max(128), action: z.literal('reconcile') }).strict()
export const maxDuration = 60
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const input = schema.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: 'Invalid refund reconciliation request' }, { status: 400 })
    if (!stripeRuntimeStatus().secretConfigured) return NextResponse.json({ error: 'Stripe is not configured' }, { status: 503 })
    return NextResponse.json(await reconcilePaymentRefunds(input.data.bookingId, { adminUserId: user.id }), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof RefundReconciliationError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Refund reconciliation could not be completed')
    return NextResponse.json({ error: 'Refund status could not be verified. Existing records were not replaced; retry reconciliation.' }, { status: 503 })
  }
}
