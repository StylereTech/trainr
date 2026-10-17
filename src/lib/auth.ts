import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { getServerSession as _gss } from "next-auth/next"
import type { NextRequest } from 'next/server'
import { resolveSessionUser } from '@/lib/session-user'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

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
      async authorize(credentials: any, req: { headers?: Record<string, string> } = {}) {
        authDebug('authorize:start', {
          provider: 'credentials',
          hasEmail: !!credentials?.email,
          hasPassword: !!credentials?.password,
        })

        if (typeof credentials?.email !== 'string' || typeof credentials?.password !== 'string' || !credentials.email.trim() || !credentials.password) {
          authDebug('authorize:missing-credentials', { provider: 'credentials' })
          return null
        }

        const email = credentials.email.trim().toLowerCase()
        if (email.length > 254 || Buffer.byteLength(credentials.password, 'utf8') > 72) return null
        const ip = getClientIp({ headers: new Headers(req.headers) })
        if (!(await rateLimit(`login-ip:${ip}`, 30, 15 * 60_000)).allowed) return null
        if (!(await rateLimit(`login-account:${email}`, 10, 15 * 60_000)).allowed) return null

        const user: any = await prisma.user.findUnique({
          where: { email },
          include: {
            parentProfile: { select: { id: true } },
            trainerProfile: { select: { id: true } },
          },
        })

        if (!user?.passwordHash || user.deletedAt) {
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
          profileId: user.role === 'PARENT' ? user.parentProfile?.id ?? null : user.role === 'TRAINER' ? user.trainerProfile?.id ?? null : null,
          sessionVersion: user.sessionVersion,
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
        token.sessionVersion = user.sessionVersion
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
      const user = await resolveSessionUser(token)
      if (!user) return null
      session.user = user
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
      try {
        const target = new URL(url, baseUrl)
        if (target.origin === new URL(baseUrl).origin) return target.href
      } catch {
        // Malformed or cross-origin redirect targets return to the application.
      }
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
    return null
  }

  const user = await resolveSessionUser(token)
  return user ? { id: user.id, role: user.role, email: user.email, profileId: user.profileId } : null
}
