import CredentialsProvider from "next-auth/providers/credentials"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { getServerSession as _gss } from "next-auth/next"

export const authOptions: any = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials: any) {
        if (!credentials?.email || !credentials?.password) return null

        const user: any = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
          include: {
            parentProfile: { select: { id: true } },
            trainerProfile: { select: { id: true } },
          },
        })

        if (!user?.passwordHash) return null

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)
        if (!isValid) return null

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
    async jwt({ token, user }: any) {
      if (user) {
        token.sub = user.id
        token.role = user.role
        token.profileId = user.profileId ?? null
      }
      return token
    },
    async session({ session, token }: any) {
      if (session.user) {
        session.user.id = token.sub
        ;(session.user as any).role = token.role
        ;(session.user as any).profileId = token.profileId ?? null
      }
      return session
    },
  },
  pages: { signIn: "/auth/signin" },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: process.env.NEXTAUTH_SECRET,
}

// Accept authOptions param (ignored) so callers don't need to change
export async function getServerSession(_opts?: any): Promise<any> {
  return _gss(authOptions)
}
