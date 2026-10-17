import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeCouponCode } from '@/lib/booking-price'
import { Prisma } from '@prisma/client'
import { z } from 'zod'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (session.user.role !== 'ADMIN') return null
  return session
}

const couponSchema = z.object({
  code: z.string().trim().min(3).max(20).transform(normalizeCouponCode).pipe(z.string().min(3).max(20)),
  discountPercent: z.number().int().min(1).max(100).optional(),
  discountAmountInCents: z.number().int().min(100).max(99_999_999).optional(),
  maxUses: z.number().int().min(1).max(100_000).default(1),
  expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const date = new Date(value)
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
  }).optional(),
  applicableSportId: z.string().min(1).optional(),
}).strict().refine(data => (data.discountPercent === undefined) !== (data.discountAmountInCents === undefined))

// GET /api/admin/coupons — List coupons
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const activeOnly = searchParams.get('active') === 'true'

  const where: any = {}
  if (activeOnly) where.isActive = true

  const [coupons, total] = await Promise.all([
    prisma.coupon.findMany({
      where,
      include: { applicableSport: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.coupon.count({ where }),
  ])

  return NextResponse.json({
    coupons,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  })
}

// POST /api/admin/coupons — Create coupon
export async function POST(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const adminUserId = session.user.id
  const input = couponSchema.safeParse(await req.json().catch(() => null))
  if (!input.success) return NextResponse.json({ error: 'Enter a valid code, exactly one discount, a whole-number use limit, and a valid expiry date.' }, { status: 400 })
  try {
    const data = input.data
    const coupon = await prisma.coupon.create({ data: {
      code: data.code,
      discountPercent: data.discountPercent,
      discountAmountInCents: data.discountAmountInCents,
      maxUses: data.maxUses,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      applicableSportId: data.applicableSportId || null,
      createdById: adminUserId,
    } })
    return NextResponse.json(coupon, { status: 201 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'This coupon code already exists.' }, { status: 409 })
    }
    console.error('Admin coupon creation failed')
    return NextResponse.json({ error: 'Coupon could not be created. Check existing codes before retrying.' }, { status: 503 })
  }
}

// PATCH /api/admin/coupons — Update coupon (toggle active, extend expiry)
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { couponId, isActive, expiresAt } = body
  if (!couponId) return NextResponse.json({ error: 'couponId required' }, { status: 400 })

  const updateData: any = {}
  if (typeof isActive === 'boolean') updateData.isActive = isActive
  if (expiresAt) updateData.expiresAt = new Date(expiresAt)

  const coupon = await prisma.coupon.update({
    where: { id: couponId },
    data: updateData,
  })

  return NextResponse.json(coupon)
}
