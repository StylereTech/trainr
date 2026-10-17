import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ auth: vi.fn(), reconcile: vi.fn(), runtime: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.auth }))
vi.mock('@/lib/stripe', () => ({ stripeRuntimeStatus: mock.runtime }))
vi.mock('@/lib/refund-reconciliation', () => ({
  reconcilePaymentRefunds: mock.reconcile,
  RefundReconciliationError: class extends Error { constructor(message: string, public status = 409) { super(message) } },
}))
import { POST } from '@/app/api/admin/refunds/route'
import { RefundReconciliationError } from '@/lib/refund-reconciliation'
const request = (body = JSON.stringify({ bookingId: 'booking', action: 'reconcile' })) => new Request('http://localhost/api/admin/refunds', { method: 'POST', body }) as any
beforeEach(() => {
  vi.resetAllMocks()
  mock.auth.mockResolvedValue({ id: 'admin', role: 'ADMIN' })
  mock.runtime.mockReturnValue({ secretConfigured: true })
  mock.reconcile.mockResolvedValue({ refundedAmountInCents: 0, pendingAmountInCents: 6000 })
})
afterEach(() => vi.restoreAllMocks())
describe('admin refund reconciliation route', () => {
  it.each([null, { id: 'parent', role: 'PARENT' }, { id: 'trainer', role: 'TRAINER' }])('denies unauthorized caller %j', async user => {
    mock.auth.mockResolvedValue(user)
    expect((await POST(request())).status).toBe(user ? 403 : 401)
    expect(mock.reconcile).not.toHaveBeenCalled()
  })
  it.each(['{', '{}', '{"bookingId":"","action":"reconcile"}', '{"bookingId":"booking","action":"refund"}', '{"bookingId":"booking","action":"reconcile","amount":6000}'])('rejects invalid body %s', async body => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mock.reconcile).not.toHaveBeenCalled()
  })
  it('requires configured Stripe and does not issue a refund', async () => {
    mock.runtime.mockReturnValue({ secretConfigured: false })
    expect((await POST(request())).status).toBe(503)
    expect(mock.reconcile).not.toHaveBeenCalled()
  })
  it('passes the actor to transactional authorization and returns uncached provider observations', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ refundedAmountInCents: 0, pendingAmountInCents: 6000 })
    expect(mock.reconcile).toHaveBeenCalledWith('booking', { adminUserId: 'admin' })
  })
  it('returns a retryable provider failure without exposing diagnostics', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mock.reconcile.mockRejectedValue(new Error('sk_test_private diagnostic'))
    const response = await POST(request())
    expect(response.status).toBe(503)
    expect(await response.text()).not.toContain('sk_test_private')
  })
  it.each([403, 404, 409])('preserves reconciliation failure status %s', async status => {
    mock.reconcile.mockRejectedValue(new RefundReconciliationError('Review required', status))
    expect((await POST(request())).status).toBe(status)
  })
})
