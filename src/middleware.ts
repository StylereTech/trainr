import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - next-auth/jwt types not resolving in edge middleware
import { getToken } from 'next-auth/jwt'

async function getAuthToken(req: NextRequest) {
  let token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: '__Secure-next-auth.session-token',
  })

  if (!token) {
    token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.session-token',
    })
  }

  return token
}

type ProtectedRouteRule = {
  prefix: string
  roles?: string[]
}

const PROTECTED_ROUTES: ProtectedRouteRule[] = [
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/parent', roles: ['PARENT'] },
  { prefix: '/trainer/dashboard', roles: ['TRAINER'] },
  { prefix: '/trainer/profile', roles: ['TRAINER'] },
  { prefix: '/trainer/onboarding', roles: ['TRAINER'] },
  { prefix: '/messages' },
  { prefix: '/review', roles: ['PARENT'] },
]

function matchesPrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(prefix + '/')
}

function getProtectedRoute(pathname: string) {
  return PROTECTED_ROUTES.find((route) => matchesPrefix(pathname, route.prefix))
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const protectedRoute = getProtectedRoute(pathname)

  if (!protectedRoute) {
    return NextResponse.next()
  }

  const token = await getAuthToken(req)

  if (!token) {
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  const role = token.role as string | undefined

  if (protectedRoute.roles?.length && (!role || !protectedRoute.roles.includes(role))) {
    const url = req.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
