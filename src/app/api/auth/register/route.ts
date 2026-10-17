import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { slugify } from '@/lib/utils'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import crypto from 'crypto'
import { requestAccountEmail } from '@/lib/account-email'

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).refine(value => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes'),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  phone: z.string().trim().max(40).optional(),
  state: z.string().length(2).optional(),
  role: z.enum(['PARENT', 'TRAINER']),
  agreeToTerms: z.literal(true),
})

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 registrations per minute per IP
    const ip = getClientIp(req)
    const rl = await rateLimit(`register:${ip}`, 5, 60_000)
    if (rl.unavailable) return NextResponse.json({ error: 'Registration is temporarily unavailable' }, { status: 503 })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.resetMs / 1000)) } }
      )
    }

    const body = await req.json()
    const data = registerSchema.parse(body)

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const passwordHash = await hash(data.password, 12)

    const user = await prisma.$transaction(async tx => {
      const created = await tx.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash,
          role: data.role,
          parentProfile: data.role === 'PARENT' ? {
            create: {
              phone: data.phone || null,
              state: data.state || null,
            }
          } : undefined,
          trainerProfile: data.role === 'TRAINER' ? {
            create: {
              firstName: data.firstName,
              lastName: data.lastName,
              slug: slugify(`${data.firstName}-${data.lastName}-${crypto.randomUUID()}`),
              phone: data.phone || null,
              state: data.state || null,
            }
          } : undefined,
        },
        select: { id: true, email: true, role: true },
      })

      // Notify admins when a new trainer registers
      if (data.role === 'TRAINER') {
        const admins = await tx.user.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { id: true } })
        if (admins.length > 0) {
          await tx.notification.createMany({
            data: admins.map(admin => ({
              userId: admin.id,
              type: 'NEW_TRAINER_SIGNUP',
              title: 'New Trainer Registration',
              message: `${data.firstName} ${data.lastName} (${data.email}) just registered as a trainer and needs approval.`,
              data: { userId: created.id, email: created.email },
            })),
          })
        }
      }
      return created
    })

    let verificationEmail: 'accepted' | 'unavailable' = 'unavailable'
    try {
      if (await requestAccountEmail(user.id, 'verification') === 'accepted') verificationEmail = 'accepted'
    } catch {
      console.error('Registration email could not be prepared')
    }

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      verificationEmail,
      message: verificationEmail === 'accepted' ? 'Account created. Verification email accepted for delivery.' : 'Account created. Verification email is unavailable; you can retry from email verification.',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    console.error('Registration failed')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
