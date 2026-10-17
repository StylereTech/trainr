import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { publicPagination, publicTrainerCardSelect } from '@/lib/public-trainer'


// GET /api/search — Search trainers with filters
export async function GET(req: NextRequest) {
  try {
    return await searchTrainers(req)
  } catch {
    console.error('Public trainer search failed')
    return NextResponse.json({ error: 'Failed to fetch trainers' }, { status: 500 })
  }
}

async function searchTrainers(req: NextRequest) {
  const { searchParams } = new URL(req.url)

  const sport = searchParams.get('sport') || undefined
  const specialty = searchParams.get('specialty') || undefined
  const priceMin = searchParams.get('priceMin') ? parseInt(searchParams.get('priceMin')!) : undefined
  const priceMax = searchParams.get('priceMax') ? parseInt(searchParams.get('priceMax')!) : undefined
  const city = searchParams.get('city') || undefined
  const state = searchParams.get('state') || undefined
  const rating = searchParams.get('rating') ? parseFloat(searchParams.get('rating')!) : undefined
  const locationType = searchParams.get('locationType') || undefined
  const q = searchParams.get('q') || undefined
  const pagination = publicPagination(searchParams)
  if (!pagination) return NextResponse.json({ error: 'Invalid pagination' }, { status: 400 })
  const { page, limit } = pagination
  const sort = searchParams.get('sort') || 'rating' // rating, price_asc, price_desc, newest, reviews

  // Build where clause for trainer profiles
  const where: any = {
    approvalStatus: 'APPROVED',
    isActive: true,
  }

  // Sport filter
  if (sport) {
    where.sports = { some: { sport: { slug: sport } } }
  }

  // Specialty filter
  if (specialty) {
    where.specialties = { some: { specialty: { slug: specialty } } }
  }

  // Location filter
  if (city) {
    where.city = { contains: city, mode: 'insensitive' }
  }
  if (state) {
    where.state = { equals: state, mode: 'insensitive' }
  }
  if (locationType) {
    where.locationType = locationType as any
  }

  // Rating filter
  if (rating) {
    where.avgRating = { gte: rating }
  }

  // Text search (headline, bio, name)
  if (q) {
    where.OR = [
      { headline: { contains: q, mode: 'insensitive' } },
      { bio: { contains: q, mode: 'insensitive' } },
      { firstName: { contains: q, mode: 'insensitive' } },
      { lastName: { contains: q, mode: 'insensitive' } },
    ]
  }

  // Price filter - trainers that have at least one service in the price range
  if (priceMin || priceMax) {
    const priceFilter: any = { isActive: true }
    if (priceMin) priceFilter.priceInCents = { ...priceFilter.priceInCents, gte: priceMin * 100 }
    if (priceMax) priceFilter.priceInCents = { ...priceFilter.priceInCents, lte: priceMax * 100 }
    where.serviceOfferings = { some: priceFilter }
  }

  // Determine sort order
  let orderBy: any
  switch (sort) {
    case 'price_asc':
      orderBy = { serviceOfferings: { _count: 'asc' } } // approx; real price sort needs raw query
      break
    case 'price_desc':
      orderBy = { serviceOfferings: { _count: 'desc' } }
      break
    case 'newest':
      orderBy = { createdAt: 'desc' }
      break
    case 'reviews':
      orderBy = { totalReviews: 'desc' }
      break
    case 'rating':
    default:
      orderBy = { avgRating: 'desc' }
      break
  }

  const [trainers, total] = await Promise.all([
    prisma.trainerProfile.findMany({
      where,
      select: { ...publicTrainerCardSelect, serviceOfferings: { ...publicTrainerCardSelect.serviceOfferings, take: 3 } },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.trainerProfile.count({ where }),
  ])

  // Also return available filter options
  const [sports, specialtiesList] = await Promise.all([
    prisma.sport.findMany({ where: { isActive: true }, orderBy: { order: 'asc' }, select: { id: true, name: true, slug: true, icon: true } }),
    prisma.specialty.findMany({
      where: { sport: { isActive: true, ...(sport ? { slug: sport } : {}) } },
      select: { id: true, name: true, slug: true, sport: { select: { name: true, slug: true } } },
    }),
  ])

  return NextResponse.json({
    trainers,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    filters: { sports, specialties: specialtiesList },
  })
}
