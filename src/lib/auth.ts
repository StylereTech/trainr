import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { getServerSession as _gss } from "next-auth/next"
import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'

const authDebugEnabled = process.env.AUTH_DEBUG === 'true'

function authDebug(event: string, meta: Record<string, unknown>) {
  if (!authDebugEnabled) return
  console.log('[auth-debug]', JSON.stringify({ event, ...meta }))
}

export const authOptions: any = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: any) {
        authDebug('authorize:start', {
          provider: 'credentials',
          hasEmail: !!credentials?.email,
          hasPassword: !!credentials?.password,
        })

        if (!credentials?.email || !credentials?.password) {
          authDebug('authorize:missing-credentials', { provider: 'credentials' })
          return null
        }

        const user: any = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: {
            parentProfile: { select: { id: true } },
            trainerProfile: { select: { id: true } },
          },
        })

        if (!user?.passwordHash) {
          authDebug('authorize:user-not-found-or-no-password', { provider: 'credentials' })
          return null
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!isValid) {
          authDebug('authorize:invalid-password', { provider: 'credentials', userId: user.id, role: user.role })
          return null
        }

        authDebug('authorize:success', { provider: 'credentials', userId: user.id, role: user.role })

        return {
          id: user.id,
          email: user.email,
          role: user.role,
          profileId: user.parentProfile?.id ?? user.trainerProfile?.id ?? null,
        }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }: any) {
      authDebug('callback:signIn', {
        provider: account?.provider,
        userId: user?.id ?? null,
        role: user?.role ?? null,
        allowed: !!user,
      })
      return true
    },
    async jwt({ token, user, account }: any) {
      if (user) {
        token.sub = user.id
        token.role = user.role
        token.profileId = user.profileId ?? null
      }
      authDebug('callback:jwt', {
        provider: account?.provider ?? null,
        tokenSub: token?.sub ?? null,
        role: token?.role ?? null,
        hasProfileId: token?.profileId != null,
      })
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.sub
        ;(session.user as any).role = token.role
        ;(session.user as any).profileId = token.profileId ?? null
      }
      authDebug('callback:session', {
        sessionUserId: session?.user?.id ?? null,
        role: (session?.user as any)?.role ?? null,
        hasProfileId: (session?.user as any)?.profileId != null,
      })
      return session
    },
    async redirect({ url, baseUrl }: any) {
      const safeTarget = url?.startsWith('/') ? `${baseUrl}${url}` : url
      authDebug('callback:redirect', {
        url,
        baseUrl,
        safeTarget,
      })
      if (url?.startsWith('/')) return `${baseUrl}${url}`
      if (url?.startsWith(baseUrl)) return url
      return baseUrl
    },
  },
  debug: authDebugEnabled,
  pages: { signIn: "/auth/signin" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
}

// Accept authOptions param (ignored) so callers don't need to change
export async function getServerSession(_opts?: any): Promise<any> {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') || headerStore.get('host')
  const proto = headerStore.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https')

  if (host) {
    process.env.NEXTAUTH_URL = `${proto}://${host}`
  }

  return _gss(authOptions)
}

export async function getRequestUser(req: NextRequest) {
  const jwtModule = await import('next-auth/jwt') as any

  let token = await jwtModule.getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: '__Secure-next-auth.session-token',
  })

  if (!token?.sub) {
    token = await jwtModule.getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.session-token',
    })
  }

  if (!token?.sub) {
    const host = req.headers.get('x-forwarded-host') || req.headers.get('host')
    const proto = req.headers.get('x-forwarded-proto') || (host?.includes('localhost') ? 'http' : 'https')
    const cookieHeader = req.cookies.getAll().map((cookie) => `${cookie.name}=${cookie.value}`).join('; ') || req.headers.get('cookie')

    if (host && cookieHeader) {
      try {
        const res = await fetch(`${proto}://${host}/api/auth/session`, {
          headers: { cookie: cookieHeader },
          cache: 'no-store',
        })

        if (res.ok) {
          const session = await res.json()
          if (session?.user?.id) {
            return {
              id: String(session.user.id),
              role: session.user.role ? String(session.user.role) : undefined,
              email: session.user.email ? String(session.user.email) : undefined,
              profileId: session.user.profileId ? String(session.user.profileId) : null,
            }
          }
        }
      } catch {
        // Fall through to null below.
      }
    }

    return null
  }

  return {
    id: String(token.sub),
    role: token.role ? String(token.role) : undefined,
    email: token.email ? String(token.email) : undefined,
    profileId: token.profileId ? String(token.profileId) : null,
  }
}
