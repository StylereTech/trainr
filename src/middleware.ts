import { NextRequest, NextResponse } from 'next/server'

// Routes that require no auth
const PUBLIC_PATHS = [
  '/',
  '/about',
  '/browse',
  '/contact',
  '/faq',
  '/for-trainers',
  '/how-it-works',
  '/sports',
  '/legal',
  '/auth',
  '/api/auth',
  '/api/search',
  '/api/trainers',
  '/api/payments/webhook',
  '/api/health',
  '/_next',
  '/favicon',
  '/images',
  '/brand',
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))
}

// Role-based path protection
const ROLE_PATHS: { prefix: string; roles: string[] }[] = [
  { prefix: '/admin', roles: ['ADMIN'] },
  { prefix: '/api/admin', roles: ['ADMIN'] },
  { prefix: '/parent', roles: ['PARENT'] },
  { prefix: '/api/athletes', roles: ['PARENT'] },
  { prefix: '/trainer/dashboard', roles: ['TRAINER'] },
  { prefix: '/trainer/profile', roles: ['TRAINER'] },
  { prefix: '/trainer/onboarding', roles: ['TRAINER'] },
  { prefix: '/api/trainer/onboarding', roles: ['TRAINER'] },
  { prefix: '/api/trainer/wallet', roles: ['TRAINER'] },
]

/**
 * Decode JWT payload from NextAuth session token cookie.
 * NextAuth v4 with JWT strategy stores the token in a cookie named
 * `next-auth.session-token` (or `__Secure-next-auth.session-token` in production).
 * The token is a JWE, but we can use the NextAuth /api/auth/session endpoint
 * for full validation. For middleware, we do a lightweight check:
 * if the cookie exists, the user is authenticated.
 * Role is embedded in the JWT payload by the jwt callback.
 */
function getSessionFromCookie(req: NextRequest): { authenticated: boolean; role?: string } {
  // NextAuth session cookie names
  const tokenCookie =
    req.cookies.get('__Secure-next-auth.session-token') ||
    req.cookies.get('next-auth.session-token')

  if (!tokenCookie?.value) {
    return { authenticated: false }
  }

  // JWE token — we can't decode role without the secret in Edge middleware.
  // For role-based middleware, we'll use a secondary cookie set by our auth callbacks.
  const roleCookie = req.cookies.get('trainr-user-role')

  return {
    authenticated: true,
    role: roleCookie?.value,
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Allow static files
  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  const { authenticated, role } = getSessionFromCookie(req)

  // Not authenticated
  if (!authenticated) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  // Role-based access (only enforced if role cookie is present)
  if (role) {
    for (const { prefix, roles } of ROLE_PATHS) {
      if (pathname.startsWith(prefix)) {
        if (!roles.includes(role)) {
          if (pathname.startsWith('/api/')) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
          }
          const url = req.nextUrl.clone()
          url.pathname = '/dashboard'
          return NextResponse.redirect(url)
        }
        break
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
