import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const trainer = await prisma.trainerProfile.findUnique({
      where: { slug },
      include: {
        sports: { include: { sport: true } },
        specialties: { include: { specialty: true } },
        certifications: true,
        serviceOfferings: { where: { isActive: true }, orderBy: { priceInCents: 'asc' } },
        packages: { where: { isActive: true }, include: { items: { include: { serviceOffering: true } } } },
        availabilitySlots: { where: { isAvailable: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        assets: { where: { type: { in: ['PHOTO', 'GALLERY'] } }, orderBy: { order: 'asc' } },
        reviews: {
          where: { isPublished: true },
          include: {
            parentProfile: { include: { user: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        _count: { select: { reviews: { where: { isPublished: true } } } },
      },
    })

    if (!trainer || trainer.approvalStatus !== 'APPROVED') {
      return NextResponse.json({ error: 'Trainer not found' }, { status: 404 })
    }

    return NextResponse.json(trainer)
  } catch (error) {
    console.error('Trainer profile error:', error)
    return NextResponse.json({ error: 'Failed to fetch trainer' }, { status: 500 })
  }
}
