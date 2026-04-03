import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from '@/lib/auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return null
  if (session.user.role !== 'ADMIN') return null
  return session
}

const couponSchema = z.object({
  code: z.string().min(3).max(20).transform(s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')),
  discountPercent: z.number().min(1).max(100).optional(),
  discountAmountInCents: z.number().min(100).optional(),
  maxUses: z.number().min(1).default(100),
  expiresAt: z.string().optional(),
  applicableSportId: z.string().optional(),
})

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
  const body = await req.json()
  const data = couponSchema.parse(body)

  if (!data.discountPercent && !data.discountAmountInCents) {
    return NextResponse.json({ error: 'Must specify discountPercent or discountAmountInCents' }, { status: 400 })
  }

  const coupon = await prisma.coupon.create({
    data: {
      code: data.code,
      discountPercent: data.discountPercent,
      discountAmountInCents: data.discountAmountInCents,
      maxUses: data.maxUses,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      applicableSportId: data.applicableSportId || null,
      createdById: adminUserId,
    },
  })

  return NextResponse.json(coupon, { status: 201 })
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
