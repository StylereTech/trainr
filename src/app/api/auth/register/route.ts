import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hash, genSalt } from 'bcryptjs'
import { z } from 'zod'
import { slugify } from '@/lib/utils'
import { rateLimit, getClientIp } from '@/lib/rate-limit'
import crypto from 'crypto'

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().min(1).max(50),
  lastName: z.string().min(1).max(50),
  phone: z.string().optional(),
  role: z.enum(['PARENT', 'TRAINER']),
})

export async function POST(req: NextRequest) {
  try {
    // Rate limit: 5 registrations per minute per IP
    const ip = getClientIp(req)
    const rl = rateLimit(`register:${ip}`, 5, 60_000)
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

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex')
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
        verificationToken,
        verificationExpiry,
        parentProfile: data.role === 'PARENT' ? {
          create: {
            phone: data.phone || null,
          }
        } : undefined,
        trainerProfile: data.role === 'TRAINER' ? {
          create: {
            firstName: data.firstName,
            lastName: data.lastName,
            slug: slugify(`${data.firstName}-${data.lastName}-${Date.now()}`),
            phone: data.phone || null,
          }
        } : undefined,
      },
      include: { parentProfile: true, trainerProfile: true },
    })

    // TODO: Send verification email via Resend when configured
    // await sendVerificationEmail(user.email, verificationToken)

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
      message: 'Account created. Please check your email to verify your account.',
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
