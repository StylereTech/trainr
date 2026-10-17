import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import { requestAccountEmail } from '@/lib/account-email'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const schema = z.object({ email: z.string().trim().email().max(254) })
const message = 'If this account is eligible, password reset instructions will be emailed. Check spam or try again later.'

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 3 requests per 15 minutes per IP
    const ip = getClientIp(req)
    const rl = await rateLimit(`forgot-pw:${ip}`, 3, 15 * 60 * 1000)
    if (rl.unavailable) return NextResponse.json({ error: 'Account recovery is temporarily unavailable' }, { status: 503 })
    if (!rl.allowed) {
      return NextResponse.json(
        { message },
        { status: 200 } // Always 200 to prevent email enumeration
      )
    }

    const body = await req.json()
    const { email } = schema.parse(body)

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })

    if (user && !user.deletedAt) {
      const result = await requestAccountEmail(user.id, 'reset')
      if (result === 'unavailable') console.error('Password reset email unavailable')
    }

    // Always return same response to prevent email enumeration
    return NextResponse.json({
      message,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Valid email required' }, { status: 400 })
    console.error('Password reset request could not be processed')
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
