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
  mocks.account.mockResolvedValue({ id: 'acct_trainer', settings: { payouts: { schedule: { interval: 'daily', delay_days: 2 } } } })
})

describe('Stripe-managed trainer payouts', () => {
  it('forwards a validated older-page cursor while retaining the owned Stripe account', async () => {
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET(new Request('http://localhost/api/trainer/wallet?startingAfter=po_previous'))
    expect(response.status).toBe(200)
    expect(mocks.payouts).toHaveBeenCalledWith({ limit: 20, starting_after: 'po_previous' }, expect.objectContaining({ stripeAccount: 'acct_trainer' }))
    expect(await response.json()).toMatchObject({ hasMore: true, nextCursor: 'po_test' })
  })

  it.each(['startingAfter=', 'startingAfter=acct_foreign', 'startingAfter=po_a&startingAfter=po_b', 'stripeAccount=acct_foreign', 'limit=1000'])('rejects unsupported payout query %s before provider access', async query => {
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET(new Request(`http://localhost/api/trainer/wallet?${query}`))
    expect(response.status).toBe(400)
    expect(mocks.balance).not.toHaveBeenCalled()
    expect(mocks.payouts).not.toHaveBeenCalled()
  })

  it('does not claim more pages when Stripe supplies no cursor anchor', async () => {
    mocks.payouts.mockResolvedValue({ data: [], has_more: true })
    const { GET } = await import('@/app/api/trainer/wallet/route')
    expect((await GET(new Request('http://localhost/api/trainer/wallet'))).status).toBe(503)
  })

  it('returns an explicit terminal page without a next cursor', async () => {
    mocks.payouts.mockResolvedValue({ data: [], has_more: false })
    const { GET } = await import('@/app/api/trainer/wallet/route')
    expect(await (await GET(new Request('http://localhost/api/trainer/wallet?startingAfter=po_previous'))).json()).toMatchObject({ payouts: [], hasMore: false, nextCursor: null })
  })

  it.each(['missing-page-flag', 'duplicate-id', 'repeated-anchor', 'wrong-account'])('rejects incoherent Stripe page evidence: %s', async scenario => {
    const payout = { id: 'po_test', amount: 5000, currency: 'usd', status: 'paid', arrival_date: 1800000000, created: 1799999999 }
    if (scenario === 'missing-page-flag') mocks.payouts.mockResolvedValue({ data: [payout] })
    if (scenario === 'duplicate-id') mocks.payouts.mockResolvedValue({ data: [payout, payout], has_more: true })
    if (scenario === 'wrong-account') mocks.account.mockResolvedValue({ id: 'acct_other' })
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET(new Request(`http://localhost/api/trainer/wallet${scenario === 'repeated-anchor' ? '?startingAfter=po_test' : ''}`))
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('payouts')
  })

  it('keeps an unknown cursor scoped to the owned account and hides provider diagnostics', async () => {
    mocks.payouts.mockRejectedValue(new Error('No such payout on private-account-id'))
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET(new Request('http://localhost/api/trainer/wallet?startingAfter=po_unknown'))
    expect(response.status).toBe(503)
    expect(mocks.payouts).toHaveBeenCalledWith({ limit: 20, starting_after: 'po_unknown' }, expect.objectContaining({ stripeAccount: 'acct_trainer' }))
    expect(JSON.stringify(await response.json())).not.toContain('private-account-id')
    expect(mocks.legacyWrite).not.toHaveBeenCalled()
  })

  it('reads balances and payout history only from the authenticated trainer Stripe account', async () => {
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET(new Request('http://localhost/api/trainer/wallet'))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(mocks.trainer).toHaveBeenCalledWith({ where: { userId: 'trainer-user' } })
    expect(mocks.balance).toHaveBeenCalledWith({}, { stripeAccount: 'acct_trainer', timeout: 10000, maxNetworkRetries: 0 })
    expect(mocks.payouts).toHaveBeenCalledWith({ limit: 20 }, { stripeAccount: 'acct_trainer', timeout: 10000, maxNetworkRetries: 0 })
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
    expect((await GET(new Request('http://localhost/api/trainer/wallet'))).status).toBe(session ? 403 : 401)
    expect(mocks.balance).not.toHaveBeenCalled()
  })

  it('does not fabricate a zero balance on a Stripe failure', async () => {
    mocks.balance.mockRejectedValue(new Error('provider failed'))
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET(new Request('http://localhost/api/trainer/wallet'))
    expect(response.status).toBe(503)
    expect(await response.json()).not.toHaveProperty('wallet')
  })

  it('reports missing Connect setup without calling the platform balance API', async () => {
    mocks.trainer.mockResolvedValue({ stripeAccountId: null })
    const { GET } = await import('@/app/api/trainer/wallet/route')
    const response = await GET(new Request('http://localhost/api/trainer/wallet'))
    expect(await response.json()).toMatchObject({ connected: false, wallet: null })
    expect(mocks.balance).not.toHaveBeenCalled()
  })

  it('keeps a manual Stripe schedule distinct from automatic payouts', async () => {
    mocks.account.mockResolvedValue({ id: 'acct_trainer', settings: { payouts: { schedule: { interval: 'manual' } } } })
    const { GET } = await import('@/app/api/trainer/wallet/route')
    expect((await (await GET(new Request('http://localhost/api/trainer/wallet'))).json()).schedule.interval).toBe('manual')
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
