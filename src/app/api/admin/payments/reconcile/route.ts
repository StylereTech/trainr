import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { stripeRuntimeStatus } from '@/lib/stripe'
import { reconcileBookingPayment, PaymentReconciliationError } from '@/lib/payment-reconciliation'
import { PaymentEventConflict, PaymentEventAuthorizationError } from '@/lib/stripe-payment-events'
import { SettlementConflict } from '@/lib/stripe-settlement'
import { RefundReconciliationError } from '@/lib/refund-reconciliation'

const schema = z.object({ bookingId: z.string().trim().min(1).max(128) }).strict()
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export const maxDuration = 90
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user) return json({ error: 'Unauthorized' }, 401)
    if (user.role !== 'ADMIN') return json({ error: 'Forbidden' }, 403)
    const input = schema.safeParse(await req.json().catch(() => null))
    if (!input.success) return json({ error: 'Invalid payment reconciliation request' }, 400)
    if (!stripeRuntimeStatus().secretConfigured) return json({ error: 'Stripe is not configured' }, 503)
    return json(await reconcileBookingPayment(input.data.bookingId, user.id))
  } catch (error) {
    if (error instanceof PaymentEventAuthorizationError) return json({ error: error.message }, 403)
    if (error instanceof PaymentReconciliationError || error instanceof RefundReconciliationError) return json({ error: error.message }, error.status)
    if (error instanceof PaymentEventConflict || error instanceof SettlementConflict) return json({ error: error.message }, 409)
    console.error('Payment reconciliation could not be completed')
    return json({ error: 'Payment refresh could not be verified. Reload the booking before retrying; do not charge again.' }, 503)
  }
}
