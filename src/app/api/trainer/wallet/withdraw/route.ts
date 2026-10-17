import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'

export async function POST() {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'TRAINER') {
    return NextResponse.json({ error: 'Only trainers can access payouts' }, { status: 403 })
  }
  return NextResponse.json({
    error: 'Booking proceeds are sent directly to your Stripe account. Manage bank payouts in Stripe; TRAINR wallet withdrawals are no longer supported.',
    code: 'STRIPE_MANAGED_PAYOUTS',
  }, { status: 409 })
}
