import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reconcileFinancialEvent } from '@/lib/stripe-financial-events'
import { settlementFixture } from './helpers/stripe-settlement-fixture'

const mock = vi.hoisted(() => ({ charge: vi.fn(), transfer: vi.fn(), fee: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), apply: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ stripe: { charges: { retrieve: mock.charge }, transfers: { retrieve: mock.transfer }, applicationFees: { retrieve: mock.fee } } }))
vi.mock('@/lib/prisma', () => ({ prisma: { payment: { findMany: mock.findMany, findFirst: mock.findFirst } } }))
// Route-to-settlement resolution only; the SQL suite uses the real paid-evidence and verifier implementations.
vi.mock('@/lib/stripe-payment-events', () => ({ applyPaymentEvidence: mock.apply }))
let f: any
beforeEach(() => {
  vi.resetAllMocks()
  f = settlementFixture()
  for (const key of ['charge', 'transfer', 'fee'] as const) mock[key].mockImplementation(async () => structuredClone(f[key]))
  mock.findMany.mockResolvedValue([{ id: 'payment', bookingId: 'booking' }])
  mock.findFirst.mockResolvedValue(null)
})

describe('financial lifecycle event resolution', () => {
  it.each(['transfer', 'fee', 'charge'] as const)('resolves %s through current provider relationships and delegates current amounts', async kind => {
    const id = f[kind].id
    expect(await reconcileFinancialEvent({ kind, id })).toEqual({ ignored: false })
    expect(mock.apply).toHaveBeenCalledExactlyOnceWith({ bookingId: 'booking', paymentId: 'payment', attemptId: 'attempt',
      intentId: 'pi_settlement', chargeId: 'ch_settlement', amount: 6000, currency: 'usd', outcome: 'paid' },
    kind === 'transfer' ? { transferId: id } : kind === 'fee' ? { feeId: id } : {})
    expect(mock.charge).toHaveBeenCalledExactlyOnceWith('ch_settlement', {}, { timeout: 4000, maxNetworkRetries: 0 })
    expect(mock.findMany.mock.calls[0][0]).toMatchObject({ take: 2 })
  })
  it('passes a dispute identity for verification against current provider history', async () => {
    await reconcileFinancialEvent({ kind: 'charge', id: f.charge.id, disputeId: 'du_test' })
    expect(mock.apply.mock.calls[0][1]).toEqual({ disputeId: 'du_test' })
  })
  it.each(['transfer', 'fee', 'charge'] as const)('rejects a different returned %s identity before settlement', async kind => {
    mock[kind].mockResolvedValueOnce({ ...f[kind], id: 'other' })
    await expect(reconcileFinancialEvent({ kind, id: f[kind].id })).rejects.toThrow('identity')
    expect(mock.apply).not.toHaveBeenCalled()
  })
  it('ignores unlinked available-balance transfers even if their metadata names a TRAINR booking', async () => {
    f.transfer.source_transaction = null
    f.transfer.metadata = { bookingId: 'booking', paymentId: 'payment' }
    expect(await reconcileFinancialEvent({ kind: 'transfer', id: f.transfer.id })).toEqual({ ignored: true })
    expect(mock.charge).not.toHaveBeenCalled()
    expect(mock.apply).not.toHaveBeenCalled()
    mock.findFirst.mockResolvedValue({ id: 'payment' })
    await expect(reconcileFinancialEvent({ kind: 'transfer', id: f.transfer.id })).rejects.toThrow('no source')
  })
  it('ignores direct-charge application fees without a platform originating charge', async () => {
    f.fee.originating_transaction = null
    expect(await reconcileFinancialEvent({ kind: 'fee', id: f.fee.id })).toEqual({ ignored: true })
    expect(mock.charge).not.toHaveBeenCalled()
    expect(mock.apply).not.toHaveBeenCalled()
  })
  it('ignores unrelated platform charges but rejects an unlinked TRAINR charge', async () => {
    mock.findMany.mockResolvedValue([])
    await expect(reconcileFinancialEvent({ kind: 'charge', id: f.charge.id })).rejects.toThrow('not linked')
    f.charge.metadata = {}
    expect(await reconcileFinancialEvent({ kind: 'charge', id: f.charge.id })).toEqual({ ignored: true })
    expect(mock.apply).not.toHaveBeenCalled()
  })
  it.each(['multiple', 'missing-intent', 'missing-id'])('rejects %s identity without any crediting', async mode => {
    if (mode === 'multiple') mock.findMany.mockResolvedValue([{ id: 'a', bookingId: 'a' }, { id: 'b', bookingId: 'b' }])
    if (mode === 'missing-intent') f.charge.payment_intent = null
    await expect(reconcileFinancialEvent({ kind: 'charge', id: mode === 'missing-id' ? '' : f.charge.id })).rejects.toThrow()
    expect(mock.apply).not.toHaveBeenCalled()
  })
  it.each(['transfer', 'fee', 'charge'] as const)('propagates %s provider unavailability for retry', async kind => {
    mock[kind].mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(reconcileFinancialEvent({ kind, id: f[kind].id })).rejects.toThrow('provider unavailable')
    expect(mock.apply).not.toHaveBeenCalled()
  })
})
