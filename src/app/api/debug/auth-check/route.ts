import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieNames = req.cookies.getAll().map((cookie) => cookie.name)
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
  const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https')
  const cookieHeader = req.cookies.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') || req.headers.get('cookie') || ''

  const jwtModule = await import('next-auth/jwt') as any
  const secureToken = await jwtModule.getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: '__Secure-next-auth.session-token',
  })
  const plainToken = await jwtModule.getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: 'next-auth.session-token',
  })

  let sessionEndpointStatus: number | null = null
  let sessionEndpointUser: { id?: string; email?: string; role?: string } | null = null

  if (host && cookieHeader) {
    try {
      const sessionRes = await fetch(`${proto}://${host}/api/auth/session`, {
        headers: { cookie: cookieHeader },
        cache: 'no-store',
      })
      sessionEndpointStatus = sessionRes.status
      const sessionData = await sessionRes.json()
      if (sessionData?.user) {
        sessionEndpointUser = {
          id: sessionData.user.id,
          email: sessionData.user.email,
          role: sessionData.user.role,
        }
      }
    } catch {
      sessionEndpointStatus = -1
    }
  }

  const requestUser = await getRequestUser(req)

  return NextResponse.json({
    host,
    proto,
    cookieNames,
    hasCookieHeader: Boolean(cookieHeader),
    hasSecret: Boolean(process.env.NEXTAUTH_SECRET),
    secureToken: secureToken
      ? { id: secureToken.sub, email: secureToken.email, role: secureToken.role, profileId: secureToken.profileId }
      : null,
    plainToken: plainToken
      ? { id: plainToken.sub, email: plainToken.email, role: plainToken.role, profileId: plainToken.profileId }
      : null,
    sessionEndpointStatus,
    sessionEndpointUser,
    requestUser,
  })
}
