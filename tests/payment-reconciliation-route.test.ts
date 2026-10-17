import { beforeEach, describe, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ auth: vi.fn(), reconcile: vi.fn(), runtime: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.auth }))
vi.mock('@/lib/stripe', () => ({ stripeRuntimeStatus: mock.runtime }))
vi.mock('@/lib/payment-reconciliation', () => ({ reconcileBookingPayment: mock.reconcile,
  PaymentReconciliationError: class extends Error { constructor(message: string, public status = 409) { super(message) } } }))
vi.mock('@/lib/stripe-payment-events', () => ({ PaymentEventConflict: class extends Error {}, PaymentEventAuthorizationError: class extends Error {} }))
vi.mock('@/lib/stripe-settlement', () => ({ SettlementConflict: class extends Error {} }))
vi.mock('@/lib/refund-reconciliation', () => ({ RefundReconciliationError: class extends Error { constructor(message: string, public status = 409) { super(message) } } }))
import { POST } from '@/app/api/admin/payments/reconcile/route'
import { PaymentReconciliationError } from '@/lib/payment-reconciliation'
import { PaymentEventConflict, PaymentEventAuthorizationError } from '@/lib/stripe-payment-events'
import { SettlementConflict } from '@/lib/stripe-settlement'
import { RefundReconciliationError } from '@/lib/refund-reconciliation'
const request = (body = JSON.stringify({ bookingId: 'booking' })) => new Request('http://localhost/api/admin/payments/reconcile', { method: 'POST', body }) as any
beforeEach(() => { vi.resetAllMocks(); mock.auth.mockResolvedValue({ id: 'admin', role: 'ADMIN' }); mock.runtime.mockReturnValue({ secretConfigured: true }); mock.reconcile.mockResolvedValue({ reconciled: true }) })
describe('admin payment refresh boundary', () => {
  it.each([null, { id: 'parent', role: 'PARENT' }, { id: 'trainer', role: 'TRAINER' }])('rejects caller %j', async user => {
    mock.auth.mockResolvedValue(user)
    const response = await POST(request())
    expect(response.status).toBe(user ? 403 : 401)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(mock.reconcile).not.toHaveBeenCalled()
  })
  it.each(['{', '{}', 'null', '{"bookingId":" "}', '{"bookingId":"b","amount":1}', '{"bookingId":"b","intentId":"pi_forged"}', JSON.stringify({ bookingId: 'x'.repeat(129) })])('rejects invalid input %s', async body => {
    expect((await POST(request(body))).status).toBe(400)
    expect(mock.reconcile).not.toHaveBeenCalled()
  })
  it('does not query providers without configuration', async () => {
    mock.runtime.mockReturnValue({ secretConfigured: false })
    expect((await POST(request())).status).toBe(503)
    expect(mock.reconcile).not.toHaveBeenCalled()
  })
  it('passes only booking identity and current actor', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({ reconciled: true })
    expect(mock.reconcile).toHaveBeenCalledWith('booking', 'admin')
  })
  it.each([
    [new PaymentReconciliationError('missing', 404), 404], [new PaymentEventAuthorizationError('revoked'), 403],
    [new PaymentEventConflict('identity'), 409], [new SettlementConflict('destination'), 409], [new RefundReconciliationError('refund'), 409],
  ])('preserves safe failure %j', async (error, status) => {
    mock.reconcile.mockRejectedValue(error)
    expect((await POST(request())).status).toBe(status)
  })
  it('redacts unexpected provider diagnostics and supports a successful retry', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mock.reconcile.mockRejectedValueOnce(new Error('sk_test_private'))
      const response = await POST(request())
      expect(response.status).toBe(503)
      expect(await response.text()).not.toContain('sk_test_private')
      expect((await POST(request())).status).toBe(200)
    } finally { log.mockRestore() }
  })
})
