import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getRequestUser } from '@/lib/auth'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import { z } from 'zod'
import { hashAccountToken } from '@/lib/account-tokens'

export async function GET(req: NextRequest) {
  const current = await getRequestUser(req)
  if (!current) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const user = await prisma.user.findUnique({ where: { id: current.id }, select: { emailVerified: true, deletedAt: true } })
    if (!user || user.deletedAt) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json({ verified: !!user.emailVerified, role: current.role }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch {
    return NextResponse.json({ error: 'Verification status unavailable' }, { status: 503 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const limit = await rateLimit(`verify:${getClientIp(req)}`, 10, 60_000)
    if (limit.unavailable) return NextResponse.json({ error: 'Verification is temporarily unavailable' }, { status: 503 })
    if (!limit.allowed) return NextResponse.json({ error: 'Try again later' }, { status: 429 })
    const { token } = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).parse(await req.json())
    const tokenHash = hashAccountToken('verification', token)

    const user = await prisma.user.findFirst({
      where: {
        verificationToken: tokenHash,
        deletedAt: null,
        emailVerified: null,
        verificationExpiry: { gt: new Date() },
      },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 400 })
    }

    const updated = await prisma.user.updateMany({
      where: { id: user.id, deletedAt: null, emailVerified: null, verificationToken: tokenHash, verificationExpiry: { gt: new Date() } },
      data: {
        emailVerified: new Date(),
        verificationToken: null,
        verificationTokenSeed: null,
        verificationExpiry: null,
      },
    })
    if (updated.count !== 1) return NextResponse.json({ error: 'Invalid or expired verification token' }, { status: 400 })

    return NextResponse.json({ success: true, message: 'Email verified successfully' })
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Verification token required' }, { status: 400 })
    console.error('Email verification failed')
    return NextResponse.json({ error: 'Verification failed' }, { status: 500 })
  }
}
