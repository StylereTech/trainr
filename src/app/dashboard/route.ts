import { NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { toAbsoluteAppUrl } from '@/lib/app-url'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session) {
    return NextResponse.redirect(toAbsoluteAppUrl('/auth/signin'))
  }

  const role = (session.user as any)?.role
  if (role === 'TRAINER') {
    return NextResponse.redirect(toAbsoluteAppUrl('/trainer/dashboard'))
  }
  if (role === 'ADMIN') {
    return NextResponse.redirect(toAbsoluteAppUrl('/admin'))
  }
  return NextResponse.redirect(toAbsoluteAppUrl('/parent/dashboard'))
}
