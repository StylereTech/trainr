import { NextRequest, NextResponse } from 'next/server'
// @ts-ignore - next-auth/jwt types not resolving in edge middleware
import { getToken } from 'next-auth/jwt'

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
  '/review',
]

// Trainer profile pages (/trainer/[slug]) are public, but these trainer routes are protected
const TRAINER_PROTECTED = ['/trainer/dashboard', '/trainer/profile', '/trainer/onboarding']

function isPublicPath(pathname: string): boolean {
  // /trainer/[slug] is public (profile view), but /trainer/dashboard etc. need auth
  if (pathname.startsWith('/trainer/')) {
    return !TRAINER_PROTECTED.some((p) => pathname.startsWith(p))
  }
  // /book/[slug] is viewable by anyone (auth checked at API level when submitting)
  if (pathname.startsWith('/book/')) {
    return true
  }
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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Allow public paths
  if (isPublicPath(pathname)) {
    return NextResponse.next()
  }

  // Allow static files
  if (pathname.includes('.') && !pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  // Decode the NextAuth JWT directly — gives us role without a separate cookie
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })

  // Not authenticated
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const url = req.nextUrl.clone()
    url.pathname = '/auth/signin'
    url.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(url)
  }

  const role = token.role as string | undefined

  // Role-based access
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
