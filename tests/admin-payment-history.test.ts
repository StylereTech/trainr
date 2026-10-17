import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  payment: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  withdrawal: { findMany: vi.fn(), count: vi.fn() },
}))
vi.mock('@/lib/auth', () => ({ authOptions: {}, getServerSession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: { payment: mocks.payment, withdrawalRequest: mocks.withdrawal } }))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
  mocks.payment.findMany.mockResolvedValue([{ id: 'payment' }])
  mocks.payment.count.mockResolvedValue(1)
  mocks.payment.aggregate.mockResolvedValueOnce({ _sum: { amountInCents: 10000, refundAmountInCents: 2500 } })
    .mockResolvedValueOnce({ _sum: { amountInCents: 2000 } })
  mocks.withdrawal.findMany.mockResolvedValue([{ id: 'legacy-request' }])
  mocks.withdrawal.count.mockResolvedValue(1)
})

async function get(query = 'view=payments') {
  const { GET } = await import('@/app/api/admin/payouts/route')
  return GET(new Request(`http://localhost/api/admin/payouts?${query}`) as any)
}

describe('Admin payment-history contract', () => {
  it('returns payment rows, summary and pagination expected by the finance page', async () => {
    const response = await get()
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      payments: [{ id: 'payment' }],
      summary: { grossCaptured: 10000, recordedRefunds: 2500, netCaptured: 7500, awaitingPayment: 2000 },
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    })
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.payment.findMany.mock.calls[0][0].include.booking.select.parentProfile.select.user.select).toEqual({ email: true })
    expect(mocks.withdrawal.findMany).not.toHaveBeenCalled()
  })

  it('keeps legacy withdrawal history separately readable', async () => {
    const response = await get('view=legacy')
    expect((await response.json()).withdrawals).toEqual([{ id: 'legacy-request' }])
    expect(mocks.payment.findMany).not.toHaveBeenCalled()
  })

  it.each(['page=-1', 'page=1.5', 'limit=0', 'limit=101', 'view=unknown', 'status=APPROVED'])(
    'rejects invalid payment queries: %s', async (query) => {
      expect((await get(query.startsWith('view=') ? query : `view=payments&${query}`)).status).toBe(400)
      expect(mocks.payment.findMany).not.toHaveBeenCalled()
      expect(mocks.withdrawal.findMany).not.toHaveBeenCalled()
    },
  )

  it('does not expose finance data to a trainer', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'trainer', role: 'TRAINER' } })
    expect((await get()).status).toBe(401)
    expect(mocks.payment.findMany).not.toHaveBeenCalled()
  })

  it('returns an explicit failure instead of a fabricated zero summary', async () => {
    mocks.payment.findMany.mockRejectedValue(new Error('database unavailable'))
    const response = await get()
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('summary')
  })
})
