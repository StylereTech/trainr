import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  session: vi.fn(), trainer: vi.fn(), balance: vi.fn(), payouts: vi.fn(), account: vi.fn(),
  configured: vi.fn(), legacyWrite: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({ authOptions: {}, getServerSession: mocks.session }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  trainerProfile: { findUnique: mocks.trainer },
  trainerWallet: { update: mocks.legacyWrite, create: mocks.legacyWrite },
  withdrawalRequest: { create: mocks.legacyWrite, update: mocks.legacyWrite },
} }))
vi.mock('@/lib/stripe', () => ({
  stripeRuntimeStatus: mocks.configured,
  stripe: { balance: { retrieve: mocks.balance }, payouts: { list: mocks.payouts }, accounts: { retrieve: mocks.account } },
}))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 'trainer-user', role: 'TRAINER' } })
  mocks.trainer.mockResolvedValue({ id: 'trainer', stripeAccountId: 'acct_trainer' })
  mocks.configured.mockReturnValue({ secretConfigured: true })
  mocks.balance.mockResolvedValue({ available: [{ currency: 'usd', amount: 6205 }, { currency: 'eur', amount: 900 }], pending: [{ currency: 'usd', amount: 500 }] })
  mocks.payouts.mockResolvedValue({ data: [{ id: 'po_test', amount: 5000, currency: 'usd', status: 'paid', arrival_date: 1800000000, created: 1799999999, destination: 'bank-private' }], has_more: true })
  mocks.account.mockResolvedValue({ settings: { payouts: { schedule: { interval: 'daily', delay_days: 2 } } } })
})

describe('Stripe-managed trainer payouts', () => {
  it('reads balances and payout history only from the authenticated trainer Stripe account', async () => {
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET()
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(mocks.trainer).toHaveBeenCalledWith({ where: { userId: 'trainer-user' } })
    expect(mocks.balance).toHaveBeenCalledWith({}, { stripeAccount: 'acct_trainer' })
    expect(mocks.payouts).toHaveBeenCalledWith({ limit: 20 }, { stripeAccount: 'acct_trainer' })
    expect(body.wallet).toEqual({ availableBalance: 6205, pendingBalance: 500 })
    expect(body.schedule.interval).toBe('daily')
    expect(body.payouts[0]).not.toHaveProperty('destination')
    expect(body.hasMore).toBe(true)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mocks.legacyWrite).not.toHaveBeenCalled()
  })

  it.each([null, { user: { id: 'parent', role: 'PARENT' } }])('rejects non-trainer access: %s', async (session) => {
    mocks.session.mockResolvedValue(session)
    const { GET } = await import('@/app/api/trainer/wallet/route')
    expect((await GET()).status).toBe(session ? 403 : 401)
    expect(mocks.balance).not.toHaveBeenCalled()
  })

  it('does not fabricate a zero balance on a Stripe failure', async () => {
    mocks.balance.mockRejectedValue(new Error('provider failed'))
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET()
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('wallet')
  })

  it('reports missing Connect setup without calling the platform balance API', async () => {
    mocks.trainer.mockResolvedValue({ stripeAccountId: null })
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET()
    expect(await response.json()).toMatchObject({ connected: false, wallet: null })
    expect(mocks.balance).not.toHaveBeenCalled()
  })

  it('keeps a manual Stripe schedule distinct from automatic payouts', async () => {
    mocks.account.mockResolvedValue({ settings: { payouts: { schedule: { interval: 'manual' } } } })
    const { GET } = await import('@/app/api/trainer/wallet/route')
    expect((await (await GET()).json()).schedule.interval).toBe('manual')
  })

  it('does not issue a second withdrawal from the legacy wallet', async () => {
    const { POST } = await import('@/app/api/trainer/wallet/withdraw/route')
    const response = await POST()
    expect(response.status).toBe(409)
    expect((await response.json()).code).toBe('STRIPE_MANAGED_PAYOUTS')
    expect(mocks.legacyWrite).not.toHaveBeenCalled()
  })

  it('prevents admins marking unreconciled legacy withdrawals as paid', async () => {
    mocks.session.mockResolvedValue({ user: { id: 'admin', role: 'ADMIN' } })
    const { PATCH } = await import('@/app/api/admin/payouts/route')
    const response = await PATCH(new Request('http://localhost/api/admin/payouts', { method: 'PATCH', body: JSON.stringify({ action: 'complete', withdrawalId: 'old' }) }) as any)
    expect(response.status).toBe(409)
    expect(mocks.legacyWrite).not.toHaveBeenCalled()
  })
})
