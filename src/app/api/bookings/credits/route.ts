import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { BookingCreationError } from '@/lib/booking-slot'
import { PackageCreditError } from '@/lib/package-credit-ledger'
import { creditBookingSchema } from '@/lib/package-credit-booking-schema'
import { createCreditBooking } from '@/lib/package-credit-booking'
import { readCreditBookingOptions } from '@/lib/credit-booking-options'
import { z } from 'zod'

const headers = { 'Cache-Control': 'private, no-store' }
export async function GET(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Only parents can reserve package sessions' }, { status: 403, headers })
    const id = z.string().trim().min(1).max(128).safeParse(new URL(req.url).searchParams.get('purchaseId'))
    if (!id.success) return NextResponse.json({ error: 'Select a package purchase' }, { status: 400, headers })
    return NextResponse.json(await readCreditBookingOptions(user.id, id.data), { headers })
  } catch (error) {
    if (error instanceof BookingCreationError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('Credit reservation options read failed')
    return NextResponse.json({ error: 'Package sessions could not be loaded. Please retry.' }, { status: 503, headers })
  }
}
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser(req)
    if (!user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    if (user.role !== 'PARENT') return NextResponse.json({ error: 'Only parents can reserve package sessions' }, { status: 403, headers })
    const input = creditBookingSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: input.error.errors[0].message }, { status: 400, headers })
    return NextResponse.json(await createCreditBooking(user.id, input.data), { status: 201, headers })
  } catch (error) {
    if (error instanceof BookingCreationError || error instanceof PackageCreditError) return NextResponse.json({ error: error.message }, { status: error.status, headers })
    console.error('Credit reservation transaction failed')
    return NextResponse.json({ error: 'Reservation could not be verified. Retry the same request or check your dashboard.' }, { status: 503, headers })
  }
}
