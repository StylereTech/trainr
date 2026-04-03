import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const getRedirectUrl = (path: string) => new URL(path, req.url)

  if (!session) {
    return NextResponse.redirect(getRedirectUrl('/auth/signin'))
  }

  const role = (session.user as any)?.role
  if (role === 'TRAINER') {
    return NextResponse.redirect(getRedirectUrl('/trainer/dashboard'))
  }
  if (role === 'ADMIN') {
    return NextResponse.redirect(getRedirectUrl('/admin'))
  }
  return NextResponse.redirect(getRedirectUrl('/parent/dashboard'))
}
