import { beforeEach, expect, it, vi } from 'vitest'
const mock = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), refresh: vi.fn(), rate: vi.fn(), configured: true }))
vi.mock('@/lib/auth', () => ({ getRequestUser: mock.auth }))
vi.mock('@/lib/package-history', () => ({ readPackageHistory: mock.read, refreshPackageHistory: mock.refresh }))
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mock.rate }))
vi.mock('@/lib/stripe', () => ({ stripeRuntimeStatus: () => ({ secretConfigured: mock.configured }), stripe: {} }))
import { GET } from '@/app/api/package-purchases/route'
import { POST } from '@/app/api/package-purchases/refresh/route'
import { PackagePurchaseError } from '@/lib/package-purchases'
import { RefundReconciliationError } from '@/lib/stripe-refund-history'
import { SettlementConflict } from '@/lib/stripe-settlement'
import { packageHistoryRecord, packageHistoryResponse, packagePaymentLabel } from '@/lib/package-history-schema'
const get = (query = '') => GET(new Request(`http://localhost/api/package-purchases?${query}`) as any)
const post = (body: unknown = { purchaseId: 'purchase' }) => POST(new Request('http://localhost/api/package-purchases/refresh', { method: 'POST', body: JSON.stringify(body) }) as any)
beforeEach(() => {
  vi.resetAllMocks(); mock.configured = true
  mock.auth.mockResolvedValue({ id: 'parent', role: 'PARENT' })
  mock.read.mockResolvedValue({ purchases: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 0 } })
  mock.refresh.mockResolvedValue({ refreshed: true, purchaseId: 'purchase' })
  mock.rate.mockResolvedValue({ allowed: true })
})
it.each(['get', 'post'])('requires authentication for %s', async method => {
  mock.auth.mockResolvedValue(null)
  const response = await (method === 'get' ? get() : post())
  expect(response.status).toBe(401); expect(response.headers.get('cache-control')).toBe('private, no-store')
  expect(mock.read).not.toHaveBeenCalled(); expect(mock.refresh).not.toHaveBeenCalled(); expect(mock.rate).not.toHaveBeenCalled()
})
it.each(['ADMIN', 'unknown'])('denies unsupported role %s on both endpoints', async role => {
  mock.auth.mockResolvedValue({ id: 'user', role })
  expect((await get()).status).toBe(403); expect((await post()).status).toBe(403)
  expect(mock.read).not.toHaveBeenCalled(); expect(mock.refresh).not.toHaveBeenCalled()
})
it.each(['view=other', 'page=0', 'page=1.5', 'limit=51', 'limit=0', 'parentProfileId=other', 'trainerProfileId=other', 'page=1&page=2'])('rejects malformed or ownership-changing query %s', async query => {
  expect((await get(query)).status).toBe(400); expect(mock.read).not.toHaveBeenCalled()
})
it.each(['PARENT', 'TRAINER'])('scopes %s requests to the authenticated actor', async role => {
  const actor = { id: 'owner', role }; mock.auth.mockResolvedValue(actor)
  const result = await get('view=review&page=2&limit=5')
  expect(result.status).toBe(200); expect(result.headers.get('cache-control')).toBe('private, no-store')
  expect(mock.read).toHaveBeenCalledWith(actor, { view: 'review', page: 2, limit: 5 })
  const refreshed = await post(); expect(refreshed.status).toBe(200)
  expect(mock.rate).toHaveBeenCalledWith('package-payment-refresh:owner', 5, 60000)
  expect(mock.refresh).toHaveBeenCalledWith(actor, 'purchase')
})
it.each([{}, null, { purchaseId: '' }, { purchaseId: 'x', userId: 'other' }, { purchaseId: 'x', refund: true }])('rejects invalid refresh request %j before provider work', async body => {
  expect((await post(body)).status).toBe(400); expect(mock.refresh).not.toHaveBeenCalled(); expect(mock.rate).not.toHaveBeenCalled()
})
it('requires configured Stripe before refreshing', async () => {
  mock.configured = false; expect((await post()).status).toBe(503); expect(mock.refresh).not.toHaveBeenCalled()
})
it.each([false, true])('fails closed for blocked/unavailable persistent rate limits (%s)', async unavailable => {
  mock.rate.mockResolvedValue({ allowed: false, unavailable, resetMs: 1234 })
  const result = await post(); expect(result.status).toBe(unavailable ? 503 : 429); expect(result.headers.get('retry-after')).toBe('2')
  expect(mock.refresh).not.toHaveBeenCalled()
})
it.each([403, 404, 409])('retains package failure %s with uncached errors', async status => {
  mock.refresh.mockRejectedValue(new PackagePurchaseError('Unavailable', status))
  const response = await post(); expect(response.status).toBe(status); expect(response.headers.get('cache-control')).toBe('private, no-store')
  mock.read.mockRejectedValue(new PackagePurchaseError('Unavailable', status)); expect((await get()).status).toBe(status)
})
it.each([new SettlementConflict('Receipt mismatch'), new RefundReconciliationError('Refund mismatch')])('returns reconciliation conflicts explicitly', async error => {
  mock.refresh.mockRejectedValue(error); expect((await post()).status).toBe(409)
})
it('does not leak SQL/provider errors or turn failed reads into empty success', async () => {
  mock.read.mockRejectedValue(new Error('private SQL details')); mock.refresh.mockRejectedValue(new Error('sk_test_private receipt'))
  const read = await get(), refresh = await post()
  expect(read.status).toBe(503); expect(await read.text()).not.toContain('private SQL')
  expect(refresh.status).toBe(503); expect(await refresh.text()).not.toContain('sk_test')
})
it.each([{}, { purchases: [] }, { purchases: [], pagination: { page: 1 } }])('rejects incomplete list response %j', value => {
  expect(packageHistoryResponse.safeParse(value).success).toBe(false)
})
const row = { id: 'purchase', title: 'Two sessions', counterparty: 'Trainer', createdAt: '2026-10-11T00:00:00Z', totalSessions: 2, validForDays: 90,
  items: [{ title: 'Session', sessionsCount: 2, durationMinutes: 60 }], amountInCents: 6000, trainerAllocationInCents: null,
  status: 'SUCCEEDED', paymentVerified: false, reviewRequired: false, canRefresh: true, settlementVerifiedAt: null, creditsGranted: 0,
  paymentSucceededAt: null, expiresAt: null,
  refundAmountInCents: 0, refundPendingAmountInCents: 0, refundFailedCount: 0, refundsVerifiedAt: null }
it('does not label an unverified saved success as paid', () => { expect(packagePaymentLabel(packageHistoryRecord.parse(row))).toBe('Payment verification needed') })
it.each(['REFUNDED', 'PARTIALLY_REFUNDED'])('requires refund receipt verification for %s wording', status => {
  expect(packagePaymentLabel(packageHistoryRecord.parse({ ...row, status, paymentVerified: true }))).toBe('Refund verification needed')
})
it('rejects an accidental provider-secret field in a history DTO', () => { expect(packageHistoryRecord.safeParse({ ...row, stripeChargeId: 'ch_private' }).success).toBe(false) })
