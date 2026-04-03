import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hash } from 'bcryptjs'
import { z } from 'zod'
import { slugify } from '@/lib/utils'

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
    const body = await req.json()
    const data = registerSchema.parse(body)

    // Check if user exists
    const existing = await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const passwordHash = await hash(data.password, 12)

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        role: data.role,
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

    return NextResponse.json({
      id: user.id,
      email: user.email,
      role: user.role,
    }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Registration error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
