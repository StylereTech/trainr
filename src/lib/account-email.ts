import { createHash } from 'node:crypto'
import { Resend } from 'resend'
import { prisma } from '@/lib/prisma'
import { createAccountToken, deriveAccountToken, hashAccountToken } from '@/lib/account-tokens'

export type AccountEmailPurpose = 'verification' | 'reset'
export type AccountEmailResult = 'accepted' | 'unavailable' | 'verified' | 'ineligible'

export async function sendAccountEmail(email: string, token: string, purpose: AccountEmailPurpose): Promise<AccountEmailResult> {
  try {
    const key = process.env.RESEND_API_KEY || ''
    const from = process.env.EMAIL_FROM || ''
    const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL
    if (!/^re_\S+$/.test(key) || /xxx|placeholder|your_/i.test(key) || !from || /[\r\n]/.test(from) || !configuredOrigin) return 'unavailable'
    if (process.env.RESEND_BASE_URL && process.env.RESEND_BASE_URL !== 'https://api.resend.com') return 'unavailable'
    const origin = new URL(configuredOrigin)
    const local = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(origin.hostname)
    if ((origin.protocol !== 'https:' && !(local && origin.protocol === 'http:')) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') return 'unavailable'
    const url = new URL(purpose === 'verification' ? '/account/verify-email' : '/auth/reset-password', origin)
    url.searchParams.set('token', token)
    const payload = { from, to: [email],
      subject: purpose === 'verification' ? 'Verify your Trainr email' : 'Reset your Trainr password',
      text: `${purpose === 'verification' ? 'Confirm your email address' : 'Choose a new password'}:\n\n${url.toString()}\n\nIf you did not request this, you can ignore this email.`,
    }
    // Reusing the persisted token also reuses the exact provider request identity.
    const options = { idempotencyKey: `trainr-account-${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`,
      signal: AbortSignal.timeout(8000), redirect: 'error' as const }
    const result = await new Resend(key).emails.send(payload, options)
    return !result.error && typeof result.data?.id === 'string' && result.data.id.length > 0 ? 'accepted' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

export async function requestAccountEmail(userId: string, purpose: AccountEmailPurpose): Promise<AccountEmailResult> {
  const pending = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
    const user = await tx.user.findUnique({ where: { id: userId } })
    if (!user || user.deletedAt) return null
    if (purpose === 'verification' && user.emailVerified) return { verified: true as const }
    const now = new Date()
    const tokenHash = purpose === 'verification' ? user.verificationToken : user.resetPasswordToken
    const seed = purpose === 'verification' ? user.verificationTokenSeed : user.resetPasswordTokenSeed
    const expiry = purpose === 'verification' ? user.verificationExpiry : user.resetPasswordExpiry
    const lifetime = (purpose === 'verification' ? 24 : 1) * 60 * 60 * 1000
    let token = seed && /^[a-f0-9]{64}$/.test(seed) ? deriveAccountToken(purpose, user.id, seed) : null
    // Brief retries keep the exact provider identity without persisting the bearer token.
    if (!token || hashAccountToken(purpose, token) !== tokenHash || !expiry || expiry.getTime() - now.getTime() <= lifetime - 15 * 60 * 1000) {
      const created = createAccountToken(purpose, user.id)
      token = created.token
      const expires = new Date(now.getTime() + lifetime)
      await tx.user.update({ where: { id: user.id }, data: purpose === 'verification'
        ? { verificationToken: created.tokenHash, verificationTokenSeed: created.seed, verificationExpiry: expires }
        : { resetPasswordToken: created.tokenHash, resetPasswordTokenSeed: created.seed, resetPasswordExpiry: expires } })
    }
    return { verified: false as const, email: user.email, token }
  })
  if (!pending) return 'ineligible'
  if (pending.verified) return 'verified'
  return sendAccountEmail(pending.email, pending.token, purpose)
}
