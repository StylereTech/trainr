import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { requestAccountEmail } from '@/lib/account-email'
import { rateLimit } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const user = await getRequestUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in to request verification email' }, { status: 401 })
  const limit = await rateLimit(`verification-email:${user.id}`, 3, 15 * 60_000)
  if (limit.unavailable) return NextResponse.json({ error: 'Verification email is temporarily unavailable' }, { status: 503 })
  if (!limit.allowed) return NextResponse.json({ error: 'Try again later' }, { status: 429 })
  try {
    const result = await requestAccountEmail(user.id, 'verification')
    if (result === 'ineligible') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (result === 'unavailable') return NextResponse.json({ error: 'Verification email is temporarily unavailable. Try again later.' }, { status: 503 })
    return NextResponse.json({ status: result }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Verification email is temporarily unavailable. Try again later.' }, { status: 503 })
  }
}
