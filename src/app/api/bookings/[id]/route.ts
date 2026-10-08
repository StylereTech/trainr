import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { applyBookingAction, BookingActionError, bookingActionSchema } from '@/lib/booking-actions'
import { closeCancelledCheckout } from '@/lib/checkout-attempts'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const input = bookingActionSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: 'Invalid booking action or reason' }, { status: 400 })
    const { id } = await params
    const booking = await applyBookingAction(id, user, input.data)
    return NextResponse.json({ ...booking, ...(input.data.action === 'cancel' ? { checkoutClosure: await closeCancelledCheckout(id) } : {}) })
  } catch (error) {
    if (error instanceof BookingActionError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Booking action transaction failed')
    return NextResponse.json({ error: 'Failed to update booking. Refresh before retrying.' }, { status: 503 })
  }
}
