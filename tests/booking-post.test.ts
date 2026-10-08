import { beforeEach, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/bookings/route'
import { BookingCreationError } from '@/lib/booking-creation'

const mock = vi.hoisted(() => ({ user: vi.fn(), create: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.user }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/booking-creation', async (original) => ({ ...await original<object>(), createBooking: mock.create }))
const input = { requestId: 'f9a4038f-506e-4c48-b77b-f50633128d7e', serviceOfferingId: 'service', athleteProfileId: 'athlete', date: '2026-11-02', startTime: '09:00' }
const post = (body: unknown = input) => POST(new Request('http://localhost/api/bookings', { method: 'POST', body: JSON.stringify(body) }) as any)

beforeEach(() => {
  vi.resetAllMocks()
  mock.user.mockResolvedValue({ id: 'parent-user', role: 'PARENT' })
  mock.create.mockResolvedValue({ id: 'booking', status: 'PENDING' })
})

it('creates through the transaction helper with the authenticated user', async () => {
  expect((await post()).status).toBe(201)
  expect(mock.create).toHaveBeenCalledWith('parent-user', input)
})
it.each(['TRAINER', 'ADMIN', undefined])('rejects booking creation for role %s', async (role) => {
  mock.user.mockResolvedValue({ id: 'user', role })
  expect((await post()).status).toBe(403)
  expect(mock.create).not.toHaveBeenCalled()
})
it('requires authentication', async () => {
  mock.user.mockResolvedValue(null)
  expect((await post()).status).toBe(401)
  expect(mock.create).not.toHaveBeenCalled()
})
it.each([{ requestId: undefined }, { requestId: 'invalid' }, { date: '2026-02-30' }, { startTime: '24:00' }, { startTime: '09:99' }, { serviceOfferingId: ' ' }])('rejects malformed input %j', async (change) => {
  expect((await post({ ...input, ...change })).status).toBe(400)
  expect(mock.create).not.toHaveBeenCalled()
})
it('returns conflict details without misclassifying them as server errors', async () => {
  mock.create.mockRejectedValue(new BookingCreationError('Session is full', 409))
  const response = await post()
  expect(response.status).toBe(409)
  expect(await response.json()).toEqual({ error: 'Session is full' })
})
it('does not expose database errors', async () => {
  mock.create.mockRejectedValue(new Error('postgres://private-host/secret'))
  const response = await post()
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private-host')
})
