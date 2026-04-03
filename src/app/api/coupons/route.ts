import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const validateSchema = z.object({
  code: z.string().min(1),
  serviceOfferingId: z.string().optional(),
})

// POST /api/coupons — Validate a coupon code
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { code, serviceOfferingId } = validateSchema.parse(body)

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase().replace(/[^A-Z0-9]/g, '') },
      include: { applicableSport: true },
    })

    if (!coupon) {
      return NextResponse.json({ valid: false, error: 'Coupon not found' }, { status: 404 })
    }

    if (!coupon.isActive) {
      return NextResponse.json({ valid: false, error: 'Coupon is no longer active' })
    }

    if (coupon.currentUses >= coupon.maxUses) {
      return NextResponse.json({ valid: false, error: 'Coupon has reached maximum uses' })
    }

    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
      return NextResponse.json({ valid: false, error: 'Coupon has expired' })
    }

    // If coupon is sport-specific, verify the service matches
    if (coupon.applicableSportId && serviceOfferingId) {
      const service = await prisma.serviceOffering.findUnique({
        where: { id: serviceOfferingId },
        include: { sport: true },
      })
      if (service?.sportId !== coupon.applicableSportId) {
        return NextResponse.json({
          valid: false,
          error: `This coupon only applies to ${coupon.applicableSport?.name || 'a specific sport'}`,
        })
      }
    }

    const discountType = coupon.discountPercent ? 'percent' : 'fixed'
    const discountValue = coupon.discountPercent || coupon.discountAmountInCents || 0

    return NextResponse.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        discountType,
        discountValue,
        discountPercent: coupon.discountPercent,
        discountAmountInCents: coupon.discountAmountInCents,
        remainingUses: coupon.maxUses - coupon.currentUses,
        expiresAt: coupon.expiresAt,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 })
    }
    console.error('Coupon validation error:', error)
    return NextResponse.json({ error: 'Failed to validate coupon' }, { status: 500 })
  }
}
