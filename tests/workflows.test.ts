import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockPrisma = {
  $transaction: vi.fn(),
  $queryRaw: vi.fn(),
  user: { findUnique: vi.fn() },
  athleteCreateRequest: { findUnique: vi.fn(), create: vi.fn() },
  parentProfile: {
    findUnique: vi.fn(),
  },
  sport: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
  athleteProfile: {
    create: vi.fn(),
  },
}

vi.mock('@/lib/prisma', () => ({
  prisma: mockPrisma,
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
  getRequestUser: vi.fn().mockResolvedValue({ id: 'parent-user-1', role: 'PARENT' }),
}))

describe('Parent athlete onboarding workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(run => run(mockPrisma))
    mockPrisma.user.findUnique.mockResolvedValue({ role: 'PARENT', deletedAt: null })
    mockPrisma.athleteCreateRequest.findUnique.mockResolvedValue(null)
    mockPrisma.sport.count.mockResolvedValue(2)
  })

  it('accepts sport slugs from the parent UI and resolves them to sport ids before create', async () => {
    mockPrisma.parentProfile.findUnique.mockResolvedValue({ id: 'parent-profile-1' })
    mockPrisma.sport.findMany.mockResolvedValue([
      { id: 'sport-football', slug: 'football' },
      { id: 'sport-basketball', slug: 'basketball' },
    ])
    mockPrisma.athleteProfile.create.mockResolvedValue({
      id: 'athlete-1',
      firstName: 'Jaylen',
      sports: [],
    })

    const { POST } = await import('@/app/api/athletes/route')
    const response = await POST(
      new Request('http://localhost:3000/api/athletes', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Jaylen',
          requestId: '72d06c97-77f0-4a29-a4cf-8c55f0666a7f',
          lastName: 'Carter',
          dateOfBirth: '2014-08-10',
          skillLevel: 'BEGINNER',
          sports: ['football', 'basketball'],
          goals: ['Improve footwork'],
        }),
      }) as any
    )

    expect(response.status).toBe(201)
    expect(mockPrisma.sport.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: { in: ['football', 'basketball'] } },
          { slug: { in: ['football', 'basketball'] } },
        ],
      },
      select: { id: true, slug: true },
    })
    expect(mockPrisma.athleteProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sports: {
            create: [
              { sportId: 'sport-football' },
              { sportId: 'sport-basketball' },
            ],
          },
        }),
      })
    )
  })

  it('rejects athlete creation when no valid sport can be resolved', async () => {
    mockPrisma.parentProfile.findUnique.mockResolvedValue({ id: 'parent-profile-1' })
    mockPrisma.sport.findMany.mockResolvedValue([])

    const { POST } = await import('@/app/api/athletes/route')
    const response = await POST(
      new Request('http://localhost:3000/api/athletes', {
        method: 'POST',
        body: JSON.stringify({
          firstName: 'Jaylen',
          requestId: '72d06c97-77f0-4a29-a4cf-8c55f0666a7f',
          lastName: 'Carter',
          dateOfBirth: '2014-08-10',
          skillLevel: 'BEGINNER',
          sports: ['unknown-sport'],
        }),
      }) as any
    )

    expect(response.status).toBe(400)
    expect(mockPrisma.athleteProfile.create).not.toHaveBeenCalled()
  })
})

describe('Trainer and booking workflow helpers', () => {
  it('normalizes trainer specialties to durable slugs for onboarding', async () => {
    const { normalizeSpecialtySelections } = await import('@/lib/trainer')

    expect(normalizeSpecialtySelections(['Speed & Agility', 'QB', 'speed & agility'])).toEqual([
      'speed-and-agility',
      'qb',
    ])
  })

  it('does not offer a start time that would overflow the trainer availability window', async () => {
    const { generateAvailableTimeSlots } = await import('@/lib/trainer')

    expect(
      generateAvailableTimeSlots(
        [{ dayOfWeek: 2, startTime: '09:00', endTime: '10:00' }],
        '2026-04-07',
        45
      )
    ).toEqual(['09:00'])
  })
})
