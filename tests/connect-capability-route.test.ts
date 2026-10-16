import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mock = vi.hoisted(() => ({ actor: vi.fn(), trainer: vi.fn(), ensure: vi.fn(), verify: vi.fn(), request: vi.fn(),
  onboarding: vi.fn(), dashboard: vi.fn(), runtime: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.actor }))
vi.mock('@/lib/connect-accounts', () => ({ ConnectAccountError: class extends Error { status = 409 },
  currentConnectTrainer: mock.trainer, ensureConnectAccount: mock.ensure, verifiedConnectAccount: mock.verify }))
vi.mock('@/lib/stripe', () => ({ requestMissingConnectCapabilities: mock.request, createAccountLink: mock.onboarding,
  createDashboardLink: mock.dashboard, stripeRuntimeStatus: mock.runtime }))
vi.mock('@/lib/app-url', () => ({ toAbsoluteAppUrl: (path: string) => `https://trainr.example.test${path}` }))

const account = (capabilities: Record<string, string>) => ({ id: 'acct_existing', type: 'express', deleted: false,
  details_submitted: false, charges_enabled: false, payouts_enabled: false, capabilities })
const request = () => new NextRequest('https://trainr.example.test/api/payments/connect', { method: 'POST' })

beforeEach(() => {
  vi.resetAllMocks()
  mock.actor.mockResolvedValue({ id: 'trainer_user', role: 'TRAINER' })
  mock.trainer.mockResolvedValue({ stripeAccountId: 'acct_existing', user: { sessionVersion: 1 } })
  mock.ensure.mockResolvedValue('acct_existing')
  mock.runtime.mockReturnValue({ secretConfigured: true })
  mock.request.mockResolvedValue(undefined)
  mock.onboarding.mockResolvedValue({ url: 'https://connect.stripe.com/synthetic' })
  mock.dashboard.mockResolvedValue({ url: 'https://dashboard.stripe.com/synthetic' })
})

describe('existing Express capability repair', () => {
  it('requests missing capabilities and re-verifies the same account before onboarding', async () => {
    mock.verify.mockResolvedValueOnce(account({})).mockResolvedValueOnce(account({ card_payments: 'inactive', transfers: 'inactive' }))
    const { POST } = await import('@/app/api/payments/connect/route')
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ stripeAccountId: 'acct_existing', onboardingUrl: 'https://connect.stripe.com/synthetic' })
    expect(mock.request).toHaveBeenCalledWith(account({}))
    expect(mock.verify).toHaveBeenCalledTimes(2)
    expect(mock.onboarding).toHaveBeenCalledWith('acct_existing', expect.any(String), expect.any(String))
    expect(mock.dashboard).not.toHaveBeenCalled()
  })

  it('does not issue an account link when capability repair fails', async () => {
    mock.verify.mockResolvedValue(account({}))
    mock.request.mockRejectedValue(new Error('provider unavailable'))
    const { POST } = await import('@/app/api/payments/connect/route')
    expect((await POST(request())).status).toBe(503)
    expect(mock.onboarding).not.toHaveBeenCalled()
    expect(mock.dashboard).not.toHaveBeenCalled()
  })
})
