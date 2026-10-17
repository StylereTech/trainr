import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getRequestUser } from '@/lib/auth'
import { dashboardViews } from '@/lib/dashboard-contract'
import { readDashboardBookings, DashboardReadError } from '@/lib/dashboard-bookings'

const querySchema = z.object({ view: z.enum(dashboardViews), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(100).default(10) }).strict()
export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestUser(req)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const input = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!input.success) return NextResponse.json({ error: 'Invalid dashboard query' }, { status: 400 })
    return NextResponse.json(await readDashboardBookings(actor, input.data.view, input.data.page, input.data.limit), { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof DashboardReadError) return NextResponse.json({ error: error.message }, { status: error.status })
    console.error('Dashboard booking read failed')
    return NextResponse.json({ error: 'Unable to load current bookings. Please retry.' }, { status: 503 })
  }
}
