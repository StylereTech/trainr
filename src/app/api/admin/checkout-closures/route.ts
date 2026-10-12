import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { CheckoutClosureAccessError, processAccountCheckoutClosure, readAccountCheckoutClosures } from '@/lib/account-checkout-closures'
import { closureAction, closureQuery } from '@/lib/account-checkout-closure-schema'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const query = closureQuery.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!query.success) return NextResponse.json({ error: 'Invalid filters' }, { status: 400 })
    return NextResponse.json(await readAccountCheckoutClosures(session.user.id, query.data.page))
  } catch (error) {
    return NextResponse.json({ error: 'Unable to read checkout closure queue' }, { status: error instanceof CheckoutClosureAccessError ? 403 : 503 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (session?.user?.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const input = closureAction.safeParse(await req.json().catch(() => null))
    if (!input.success) return NextResponse.json({ error: 'Invalid closure request' }, { status: 400 })
    return NextResponse.json(await processAccountCheckoutClosure(input.data.id, { adminId: session.user.id }))
  } catch (error) {
    return NextResponse.json({ error: 'Closure result is unconfirmed. Reload the queue before retrying.' }, { status: error instanceof CheckoutClosureAccessError ? 403 : 503 })
  }
}
