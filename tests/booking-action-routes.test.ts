import { beforeEach, expect, it, vi } from 'vitest'
import { PATCH as patchBooking } from '@/app/api/bookings/[id]/route'
import { PATCH as patchAdmin } from '@/app/api/admin/bookings/route'
import { BookingActionError } from '@/lib/booking-actions'

const mock = vi.hoisted(() => ({ user: vi.fn(), apply: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.user }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/booking-actions', async (original) => ({ ...await original<object>(), applyBookingAction: mock.apply }))
beforeEach(() => {
  vi.resetAllMocks()
  mock.user.mockResolvedValue({ id: 'actor', role: 'ADMIN' })
  mock.apply.mockResolvedValue({ id: 'booking', status: 'CANCELLED' })
})
for (const route of ['booking', 'admin']) {
  const request = (body: unknown = { bookingId: 'booking', action: 'cancel' }) => {
    const req = new Request('http://localhost/api/bookings/booking', { method: 'PATCH', body: JSON.stringify(body) }) as any
    return route === 'admin' ? patchAdmin(req) : patchBooking(req, { params: Promise.resolve({ id: 'booking' }) })
  }
  it(`${route}: authenticates before changing records`, async () => {
    mock.user.mockResolvedValue(null)
    expect((await request()).status).toBe(401)
    expect(mock.apply).not.toHaveBeenCalled()
  })
  it(`${route}: delegates to the shared transition helper`, async () => {
    expect((await request()).status).toBe(200)
    expect(mock.apply).toHaveBeenCalledWith('booking', { id: 'actor', role: 'ADMIN' }, expect.objectContaining({ action: 'cancel' }))
  })
  it.each([null, { action: 'refund' }, { action: 'cancel', reason: 123 }, { action: 'cancel', reason: 'x'.repeat(2001) }])(`${route}: rejects malformed body %j`, async (body) => {
    expect((await request(body)).status).toBe(400)
    expect(mock.apply).not.toHaveBeenCalled()
  })
  it(`${route}: preserves transition conflict status`, async () => {
    mock.apply.mockRejectedValue(new BookingActionError('Payment required', 409))
    expect((await request()).status).toBe(409)
  })
  it(`${route}: never exposes raw persistence diagnostics`, async () => {
    mock.apply.mockRejectedValue(new Error('secret database password'))
    const response = await request()
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('secret')
  })
}
it('rejects non-admin callers at the admin endpoint', async () => {
  mock.user.mockResolvedValue({ id: 'actor', role: 'TRAINER' })
  expect((await patchAdmin(new Request('http://localhost/api/admin/bookings', { method: 'PATCH', body: '{}' }) as any)).status).toBe(403)
  expect(mock.apply).not.toHaveBeenCalled()
})
