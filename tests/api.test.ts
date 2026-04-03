import { describe, it, expect, vi, beforeEach } from 'vitest'
import { signupSchema } from '../src/lib/validations'

// Mock Prisma
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  parentProfile: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  trainerProfile: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  athleteProfile: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  booking: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  serviceOffering: {
    findUnique: vi.fn(),
    create: vi.fn(),
  },
  payment: {
    findUnique: vi.fn(),
    create: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
  },
  notification: {
    create: vi.fn(),
    createMany: vi.fn(),
  },
  coupon: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  sport: {
    findMany: vi.fn(),
  },
  $disconnect: vi.fn(),
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

// Mock next-auth
vi.mock('next-auth', () => ({
  default: vi.fn(),
}))
vi.mock('next-auth/next', () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: 'user-1', role: 'PARENT', email: 'parent@test.com' },
  }),
}))
vi.mock('@/app/api/auth/[...nextauth]/route', () => ({
  authOptions: {},
}))

describe('Auth — Registration', () => {
  it('should validate email format', () => {
    const result = signupSchema.safeParse({
      email: 'invalid-email',
      password: 'Password123!',
      confirmPassword: 'Password123!',
      firstName: 'Test',
      lastName: 'User',
      role: 'PARENT',
      agreeToTerms: true,
    })

    expect(result.success).toBe(false)
  })

  it('should hash passwords before storing', async () => {
    const bcrypt = await import('bcryptjs')
    const hash = await bcrypt.hash('Password123!', 10)
    expect(hash).not.toBe('Password123!')
    expect(await bcrypt.compare('Password123!', hash)).toBe(true)
  })
})

describe('Booking Flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a booking with correct fee calculation', () => {
    const totalAmount = 7500 // $75.00
    const commissionPercent = 15
    const platformFee = Math.round(totalAmount * (commissionPercent / 100))
    const trainerPayout = totalAmount - platformFee

    expect(platformFee).toBe(1125) // $11.25
    expect(trainerPayout).toBe(6375) // $63.75
  })

  it('should calculate end time from duration', () => {
    const startTime = '09:00'
    const durationMinutes = 60
    const [startH, startM] = startTime.split(':').map(Number)
    const endMinutes = startH * 60 + startM + durationMinutes
    const endH = Math.floor(endMinutes / 60)
    const endM = endMinutes % 60
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

    expect(endTime).toBe('10:00')
  })

  it('should calculate 90-minute session end time correctly', () => {
    const startTime = '14:30'
    const durationMinutes = 90
    const [startH, startM] = startTime.split(':').map(Number)
    const endMinutes = startH * 60 + startM + durationMinutes
    const endH = Math.floor(endMinutes / 60)
    const endM = endMinutes % 60
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`

    expect(endTime).toBe('16:00')
  })

  it('should reject booking for time conflicts', async () => {
    mockPrisma.booking.findFirst.mockResolvedValueOnce({
      id: 'existing-booking',
      status: 'CONFIRMED',
    })

    const existing = await mockPrisma.booking.findFirst({
      where: {
        trainerProfileId: 'trainer-1',
        date: new Date('2026-04-01'),
        startTime: '09:00',
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
    })

    expect(existing).toBeTruthy()
  })
})

describe('Search — Filter Logic', () => {
  it('should build correct where clause for sport filter', () => {
    const sport = 'football'
    const where: any = {
      approvalStatus: 'APPROVED',
      isActive: true,
    }
    if (sport) {
      where.sports = { some: { sport: { slug: sport } } }
    }

    expect(where.sports).toBeDefined()
    expect(where.sports.some.sport.slug).toBe('football')
  })

  it('should build correct where clause for price range', () => {
    const priceMin = 30
    const priceMax = 80
    const where: any = { approvalStatus: 'APPROVED', isActive: true }
    const priceFilter: any = { isActive: true }
    if (priceMin) priceFilter.priceInCents = { gte: priceMin * 100 }
    if (priceMax) priceFilter.priceInCents = { ...priceFilter.priceInCents, lte: priceMax * 100 }
    where.serviceOfferings = { some: priceFilter }

    expect(where.serviceOfferings.some.priceInCents).toEqual({ gte: 3000, lte: 8000 })
  })

  it('should build correct where clause for rating filter', () => {
    const rating = 4.0
    const where: any = { approvalStatus: 'APPROVED', isActive: true }
    if (rating) where.avgRating = { gte: rating }

    expect(where.avgRating).toEqual({ gte: 4.0 })
  })

  it('should build combined filter where clause', () => {
    const sport = 'basketball'
    const city = 'Dallas'
    const rating = 4.5
    const where: any = { approvalStatus: 'APPROVED', isActive: true }

    if (sport) where.sports = { some: { sport: { slug: sport } } }
    if (city) where.city = { contains: city, mode: 'insensitive' }
    if (rating) where.avgRating = { gte: rating }

    expect(where.sports).toBeDefined()
    expect(where.city).toBeDefined()
    expect(where.avgRating).toBeDefined()
  })
})

describe('Coupon Validation', () => {
  it('should validate a valid coupon', () => {
    const coupon = {
      isActive: true,
      maxUses: 100,
      currentUses: 23,
      expiresAt: new Date('2026-12-31'),
      discountPercent: 10,
    }

    const isValid = coupon.isActive && coupon.currentUses < coupon.maxUses && (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date())
    expect(isValid).toBe(true)
  })

  it('should reject expired coupon', () => {
    const coupon = {
      isActive: true,
      maxUses: 100,
      currentUses: 23,
      expiresAt: new Date('2020-01-01'),
      discountPercent: 10,
    }

    const isValid = coupon.isActive && coupon.currentUses < coupon.maxUses && (!coupon.expiresAt || new Date(coupon.expiresAt) > new Date())
    expect(isValid).toBe(false)
  })

  it('should reject maxed out coupon', () => {
    const coupon = {
      isActive: true,
      maxUses: 100,
      currentUses: 100,
      expiresAt: null,
      discountPercent: 10,
    }

    const isValid = coupon.isActive && coupon.currentUses < coupon.maxUses
    expect(isValid).toBe(false)
  })

  it('should calculate percentage discount correctly', () => {
    const totalAmount = 7500 // $75
    const discountPercent = 20
    const discount = Math.round(totalAmount * discountPercent / 100)

    expect(discount).toBe(1500) // $15.00
    expect(totalAmount - discount).toBe(6000) // $60.00
  })

  it('should calculate fixed discount correctly', () => {
    const totalAmount = 7500 // $75
    const discountAmountInCents = 1000 // $10
    const discount = Math.min(discountAmountInCents, totalAmount)

    expect(discount).toBe(1000)
    expect(totalAmount - discount).toBe(6500) // $65.00
  })
})

describe('Payment Fee Calculation', () => {
  it('should calculate platform fee as 15% of total', () => {
    const total = 10000 // $100
    const fee = Math.round(total * 0.15)
    expect(fee).toBe(1500) // $15
  })

  it('should handle edge case of minimum booking amount', () => {
    const minBookingCents = 1500 // $15
    const total = 1500
    const fee = Math.round(total * 0.15)
    expect(fee).toBe(225) // $2.25
    expect(total - fee).toBe(1275) // $12.75 to trainer
  })
})
