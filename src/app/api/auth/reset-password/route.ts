import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const schema = z.object({
  token: z.string().min(1).max(128),
  password: z.string().min(8, 'Password must be at least 8 characters').refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes'),
})

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 per 15 minutes per IP
    const ip = getClientIp(req)
    const rl = rateLimit(`reset-pw:${ip}`, 5, 15 * 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many attempts. Please try again later.' }, { status: 429 })
    }

    const body = await req.json()
    const { token, password } = schema.parse(body)

    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        deletedAt: null,
        resetPasswordExpiry: { gt: new Date() },
      },
      select: { id: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 })
    }

    const passwordHash = await hash(password, 12)

    const updated = await prisma.user.updateMany({
      where: { id: user.id, deletedAt: null, resetPasswordToken: token, resetPasswordExpiry: { gt: new Date() } },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
        resetPasswordToken: null,
        resetPasswordExpiry: null,
      },
    })

    if (updated.count !== 1) return NextResponse.json({ error: 'Invalid or expired reset token' }, { status: 400 })

    return NextResponse.json({ message: 'Password reset successfully. You can now sign in.' })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    console.error('Password reset failed')
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
