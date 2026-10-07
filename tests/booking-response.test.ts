import { beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  parent: { findUnique: vi.fn() },
  booking: { findMany: vi.fn(), count: vi.fn() },
}))
vi.mock('@/lib/auth', () => ({ getRequestUser: mocks.user }))
vi.mock('@/lib/prisma', () => ({ prisma: { parentProfile: mocks.parent, booking: mocks.booking } }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.parent.findUnique.mockResolvedValue({ id: 'parent' })
  mocks.booking.count.mockResolvedValue(1)
  mocks.booking.findMany.mockImplementation(async (query) => {
    const storedUser = { id: 'user', email: 'parent@example.test', passwordHash: 'secret', resetPasswordToken: 'token' }
    const select = query.include.parentProfile.include.user.select
    const user = select ? Object.fromEntries(Object.entries(storedUser).filter(([key]) => select[key])) : storedUser
    return [{ id: 'booking', parentProfile: { user } }]
  })
})

it('returns booking contact fields without parent credentials', async () => {
  mocks.user.mockResolvedValue({ id: 'user', role: 'PARENT' })
  const { GET } = await import('@/app/api/bookings/route')
  const response = await GET(new Request('http://localhost/api/bookings') as any)
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.bookings[0].parentProfile.user).toEqual({ id: 'user', email: 'parent@example.test' })
  expect(mocks.booking.findMany.mock.calls[0][0].where).toEqual({ parentProfileId: 'parent' })
})

it('rejects a session without a recognized role before querying bookings', async () => {
  mocks.user.mockResolvedValue({ id: 'user', role: undefined })
  const { GET } = await import('@/app/api/bookings/route')
  const response = await GET(new Request('http://localhost/api/bookings') as any)
  expect(response.status).toBe(403)
  expect(mocks.booking.findMany).not.toHaveBeenCalled()
})
