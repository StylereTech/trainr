import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as browse } from '@/app/api/trainers/route'
import { GET as search } from '@/app/api/search/route'
import { getPublicTrainerBySlug } from '@/lib/trainer-detail'

const mock = vi.hoisted(() => ({ many: vi.fn(), first: vi.fn(), count: vi.fn(), sports: vi.fn(), specialties: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { trainerProfile: { findMany: mock.many, findFirst: mock.first, count: mock.count },
  sport: { findMany: mock.sports }, specialty: { findMany: mock.specialties } } }))
const request = (query = '') => new Request(`http://localhost/api/trainers?${query}`) as any
const privateKeys = ['userId', 'user', 'email', 'passwordHash', 'phone', 'address', 'zipCode', 'latitude', 'longitude',
  'stripeAccountId', 'stripeOnboardingComplete', 'completionPercentage', 'approvedAt', 'rejectedReason', 'trainerProfileId', 'parentProfileId', 'bookingId']

function expectPrivateFieldsAbsent(value: unknown) {
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    expect(privateKeys).not.toContain(key)
    expectPrivateFieldsAbsent(nested)
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mock.many.mockResolvedValue([])
  mock.first.mockResolvedValue(null)
  mock.count.mockResolvedValue(0)
  mock.sports.mockResolvedValue([])
  mock.specialties.mockResolvedValue([])
})

describe.each([['browse', browse, 1], ['search', search, 3]] as const)('%s public trainer boundary', (_name, handler, serviceCount) => {
  it('uses explicit nested public projections and keeps approved/active scope', async () => {
    const response = await handler(request())
    expect(response.status).toBe(200)
    const query = mock.many.mock.calls[0][0]
    expect(query.include).toBeUndefined()
    expect(query.where).toEqual({ approvalStatus: 'APPROVED', isActive: true })
    expect(query.take).toBe(12)
    expect(query.skip).toBe(0)
    expectPrivateFieldsAbsent(query.select)
    expect(Object.keys(query.select).sort()).toEqual(['id', 'slug', 'firstName', 'lastName', 'headline', 'city', 'state', 'avgRating', 'totalReviews',
      'totalSessions', 'locationType', 'featured', 'sports', 'specialties', 'serviceOfferings', 'assets'].sort())
    expect(query.select.assets.select).toEqual({ url: true, type: true, order: true })
    expect(query.select.sports.select.sport.select).toEqual({ name: true, slug: true, icon: true })
    expect(query.select.serviceOfferings).toMatchObject({ where: { isActive: true }, take: serviceCount,
      select: { id: true, title: true, priceInCents: true, durationMinutes: true, type: true } })
    expect(await response.json()).toMatchObject({ trainers: [], pagination: { page: 1, limit: 12, total: 0, totalPages: 0 } })
  })
  it.each(['page=0', 'page=-1', 'page=1.5', 'page=nope', 'page=10001', 'limit=0', 'limit=-1', 'limit=1.5', 'limit=nope', 'limit=101'])('rejects invalid/unbounded pagination before querying: %s', async query => {
    const response = await handler(request(query))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'Invalid pagination' })
    expect(mock.many).not.toHaveBeenCalled()
    expect(mock.count).not.toHaveBeenCalled()
  })
  it('preserves bounded pagination and sport filtering', async () => {
    await handler(request('page=2&limit=100&sport=football'))
    expect(mock.many.mock.calls[0][0]).toMatchObject({ skip: 100, take: 100, where: { sports: { some: { sport: { slug: 'football' } } } } })
  })
  it('does not expose persistence diagnostics in error responses', async () => {
    mock.many.mockRejectedValue(new Error('synthetic-private-diagnostic'))
    const response = await handler(request())
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Failed to fetch trainers' })
  })
})

it('search filter catalog uses explicit fields and excludes disabled sport specialties', async () => {
  await search(request('sport=football'))
  expect(mock.sports.mock.calls[0][0].select).toEqual({ id: true, name: true, slug: true, icon: true })
  expect(mock.specialties.mock.calls[0][0]).toMatchObject({ where: { sport: { isActive: true, slug: 'football' } },
    select: { id: true, name: true, slug: true, sport: { select: { name: true, slug: true } } } })
})

it('public details never query parent identifiers or email for reviews', async () => {
  await getPublicTrainerBySlug('example')
  const query = mock.first.mock.calls[0][0]
  expectPrivateFieldsAbsent(query.select)
  expect(query.select.reviews.where).toEqual({ isPublished: true })
  expect(query.select.reviews.select.parentProfile).toBeUndefined()
  expect(query.select.reviews.select.comment).toBe(true)
})
