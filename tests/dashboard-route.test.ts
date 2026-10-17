import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.auth }))
vi.mock('@/lib/dashboard-bookings', () => ({ readDashboardBookings: mock.read, DashboardReadError: class extends Error { constructor(message: string, public status: number) { super(message) } } }))
import { GET } from '@/app/api/dashboard/bookings/route'
import { DashboardReadError } from '@/lib/dashboard-bookings'
import { dashboardResponseSchema, payoutBalanceSchema } from '@/lib/dashboard-contract'
const get = (query = 'view=upcoming') => GET(new Request(`http://localhost/api/dashboard/bookings?${query}`) as any)
beforeEach(() => { vi.resetAllMocks(); mock.auth.mockResolvedValue({ id: 'parent', role: 'PARENT' }); mock.read.mockResolvedValue({ bookings: [] }) })
it('denies anonymous access', async () => { mock.auth.mockResolvedValue(null); expect((await get()).status).toBe(401); expect(mock.read).not.toHaveBeenCalled() })
it.each(['', 'view=invalid', 'view=all&page=0', 'view=all&page=1.5', 'view=all&limit=101', 'view=all&limit=0', 'view=all&parentProfileId=other'])('rejects invalid or ownership-changing query %s', async query => {
  expect((await get(query)).status).toBe(400); expect(mock.read).not.toHaveBeenCalled()
})
it('uses authenticated identity and returns private uncached results', async () => {
  const result = await get('view=upcoming&page=2&limit=10')
  expect(result.status).toBe(200)
  expect(result.headers.get('cache-control')).toBe('private, no-store')
  expect(mock.read).toHaveBeenCalledWith({ id: 'parent', role: 'PARENT' }, 'upcoming', 2, 10)
})
it.each([400, 403, 404])('preserves expected failure %s', async status => {
  mock.read.mockRejectedValue(new DashboardReadError('Unavailable', status)); expect((await get()).status).toBe(status)
})
it('never converts persistence failure into an empty successful response', async () => {
  mock.read.mockRejectedValue(new Error('private SQL details'))
  const response = await get(); expect(response.status).toBe(503); expect(await response.text()).not.toContain('private SQL')
})
it.each([{}, { bookings: [] }, { bookings: [], counts: {}, pagination: { total: 0 } }])('rejects incomplete dashboard payloads %j', body => { expect(dashboardResponseSchema.safeParse(body).success).toBe(false) })
it.each([{ source: 'legacy', connected: true, currency: 'usd', wallet: { availableBalance: 9000, pendingBalance: 0 } }, { source: 'stripe', connected: true, currency: 'eur', wallet: { availableBalance: 9000, pendingBalance: 0 } }, { source: 'stripe', connected: true, currency: 'usd', wallet: null }, {}])('does not trust incomplete or non-Stripe USD balance %j', body => {
  expect(payoutBalanceSchema.safeParse(body).success).toBe(false)
})
it('preserves a real negative Stripe balance instead of fabricating zero', () => {
  expect(payoutBalanceSchema.parse({ source: 'stripe', connected: true, currency: 'usd', wallet: { availableBalance: -2500, pendingBalance: 1000 } })).toMatchObject({ wallet: { availableBalance: -2500 } })
})
