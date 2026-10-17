import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { packageHistoryQuery } from '@/lib/package-history-schema'
import { readPackageHistory } from '@/lib/package-history'
import { PackagePurchaseError } from '@/lib/package-purchases'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestUser(req)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    if (!['PARENT', 'TRAINER'].includes(actor.role)) return json({ error: 'Forbidden' }, 403)
    const query = new URL(req.url).searchParams
    if (new Set(query.keys()).size !== Array.from(query.keys()).length) return json({ error: 'Invalid package purchase query' }, 400)
    const parsed = packageHistoryQuery.safeParse(Object.fromEntries(query))
    if (!parsed.success) return json({ error: 'Invalid package purchase query' }, 400)
    return json(await readPackageHistory(actor, parsed.data))
  } catch (error) {
    if (error instanceof PackagePurchaseError) return json({ error: error.message }, error.status)
    console.error('Package purchase history unavailable')
    return json({ error: 'Unable to load current package purchases. Please retry.' }, 503)
  }
}
