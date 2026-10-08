import { prisma } from '@/lib/prisma'

type SessionClaims = { sub?: unknown; role?: unknown; sessionVersion?: unknown }

export async function resolveSessionUser(token: SessionClaims | null) {
  if (!token || typeof token.sub !== 'string' || !token.sub ||
      typeof token.sessionVersion !== 'number' || !Number.isSafeInteger(token.sessionVersion) || token.sessionVersion < 0) return null
  try {
    const user = await prisma.user.findUnique({ where: { id: token.sub }, select: {
      id: true, email: true, image: true, role: true, sessionVersion: true,
      parentProfile: { select: { id: true } }, trainerProfile: { select: { id: true } },
    } })
    if (!user || user.sessionVersion !== token.sessionVersion || user.role !== token.role) return null
    return { id: user.id, email: user.email, image: user.image, role: user.role,
      profileId: user.role === 'PARENT' ? user.parentProfile?.id ?? null : user.role === 'TRAINER' ? user.trainerProfile?.id ?? null : null }
  } catch {
    // A lookup failure must never fall back to stale privileges from the cookie.
    console.error('Current session account could not be verified')
    return null
  }
}
