import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const sport = searchParams.get('sport')
    const specialty = searchParams.get('specialty')
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const location = searchParams.get('location')
    const rating = searchParams.get('rating')
    const locationType = searchParams.get('locationType')
    const sort = searchParams.get('sort') || 'rating'
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const skip = (page - 1) * limit

    const where: Prisma.TrainerProfileWhereInput = {
      approvalStatus: 'APPROVED',
      isActive: true,
    }

    if (sport) {
      where.sports = { some: { sport: { slug: sport } } }
    }

    if (specialty) {
      where.specialties = { some: { specialty: { slug: specialty } } }
    }

    if (minPrice || maxPrice) {
      where.serviceOfferings = {
        some: {
          priceInCents: {
            ...(minPrice ? { gte: parseInt(minPrice) * 100 } : {}),
            ...(maxPrice ? { lte: parseInt(maxPrice) * 100 } : {}),
          },
          isActive: true,
        },
      }
    }

    if (location) {
      where.OR = [
        { city: { contains: location, mode: 'insensitive' } },
        { state: { contains: location, mode: 'insensitive' } },
        { zipCode: { contains: location } },
      ]
    }

    if (rating) {
      where.avgRating = { gte: parseFloat(rating) }
    }

    if (locationType) {
      where.locationType = locationType as any
    }

    // Sort
    let orderBy: Prisma.TrainerProfileOrderByWithRelationInput = { avgRating: 'desc' }
    if (sort === 'price_low') {
      orderBy = { serviceOfferings: { _count: 'asc' } } // Fallback — proper price sort needs raw query
    } else if (sort === 'price_high') {
      orderBy = { serviceOfferings: { _count: 'desc' } }
    } else if (sort === 'newest') {
      orderBy = { createdAt: 'desc' }
    } else if (sort === 'sessions') {
      orderBy = { totalSessions: 'desc' }
    } else if (sort === 'reviews') {
      orderBy = { totalReviews: 'desc' }
    }

    const [trainers, total] = await Promise.all([
      prisma.trainerProfile.findMany({
        where,
        include: {
          sports: { include: { sport: true } },
          specialties: { include: { specialty: true } },
          serviceOfferings: { where: { isActive: true }, take: 1, orderBy: { priceInCents: 'asc' } },
          assets: { where: { type: 'PHOTO' }, orderBy: { order: 'asc' }, take: 1 },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.trainerProfile.count({ where }),
    ])

    return NextResponse.json({
      trainers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Browse error:', error)
    return NextResponse.json({ error: 'Failed to fetch trainers' }, { status: 500 })
  }
}
