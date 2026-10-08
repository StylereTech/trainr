import { beforeEach, describe, expect, it, vi } from 'vitest'
import { verifyDestinationSettlement, SettlementConflict } from '@/lib/stripe-settlement'
import { settlementFixture } from './helpers/stripe-settlement-fixture'

const provider = vi.hoisted(() => ({ intent: vi.fn(), charge: vi.fn(), transfer: vi.fn(), fee: vi.fn() }))
vi.mock('@/lib/stripe', () => ({ stripe: {
  paymentIntents: { retrieve: provider.intent }, charges: { retrieve: provider.charge },
  transfers: { retrieve: provider.transfer }, applicationFees: { retrieve: provider.fee },
} }))
let f: any
const verify = (eventChargeId?: string) => verifyDestinationSettlement(f.booking, f.attempt, 'pi_settlement', eventChargeId)
beforeEach(() => {
  vi.resetAllMocks()
  f = settlementFixture()
  for (const name of ['intent', 'charge', 'transfer', 'fee'] as const) provider[name].mockImplementation(async () => structuredClone(f[name]))
})

describe('destination settlement provider verification', () => {
  it('proves the captured gross transfer and returned fee, with bounded platform-context reads', async () => {
    expect(await verify()).toEqual({ chargeId: 'ch_settlement', transferId: 'tr_settlement', hasRefunds: false, requiresReview: false })
    for (const [name, id] of [['intent', 'pi_settlement'], ['charge', 'ch_settlement'], ['transfer', 'tr_settlement'], ['fee', 'fee_settlement']] as const) {
      expect(provider[name]).toHaveBeenCalledExactlyOnceWith(id, {}, { timeout: 4000, maxNetworkRetries: 0 })
    }
  })
  it('accepts expanded IDs and compares the fee charge to the destination payment, not the platform charge', async () => {
    f.intent.latest_charge = { id: 'ch_settlement' }
    f.intent.transfer_data.destination = { id: 'acct_settlement' }
    f.charge.payment_intent = { id: 'pi_settlement' }
    f.charge.transfer = { id: 'tr_settlement' }
    f.charge.application_fee = { id: 'fee_settlement' }
    f.charge.transfer_data.destination = { id: 'acct_settlement' }
    f.transfer.source_transaction = { id: 'ch_settlement' }
    f.transfer.destination = { id: 'acct_settlement' }
    f.transfer.destination_payment = { id: 'py_settlement' }
    f.fee.account = { id: 'acct_settlement' }
    f.fee.originating_transaction = { id: 'ch_settlement' }
    f.fee.charge = { id: 'py_settlement' }
    expect((await verify()).requiresReview).toBe(false)
  })
  it.each([
    ['intent', { id: 'pi_other' }], ['intent', { status: 'processing' }], ['intent', { amount: 6001 }],
    ['intent', { amount_received: 5999 }], ['intent', { currency: 'eur' }], ['intent', { livemode: undefined }],
    ['intent', { metadata: {} }], ['intent', { metadata: { bookingId: 'other', paymentId: 'payment', checkoutAttemptId: 'attempt' } }],
    ['intent', { application_fee_amount: 901 }], ['intent', { transfer_data: null }],
    ['intent', { transfer_data: { destination: 'acct_other' } }],
    ['intent', { transfer_data: { destination: 'acct_settlement', amount: 5100 } }], ['intent', { latest_charge: null }],
    ['charge', { id: 'ch_other' }], ['charge', { payment_intent: 'pi_other' }], ['charge', { status: 'failed' }],
    ['charge', { paid: false }], ['charge', { captured: false }], ['charge', { amount: 5999 }], ['charge', { amount_captured: 5999 }],
    ['charge', { currency: 'eur' }], ['charge', { livemode: true }], ['charge', { metadata: {} }],
    ['charge', { application_fee_amount: 901 }], ['charge', { transfer_data: { destination: 'acct_other' } }],
    ['charge', { transfer_data: { destination: 'acct_settlement', amount: 5100 } }], ['charge', { amount_refunded: -1 }],
    ['charge', { amount_refunded: 6001 }], ['charge', { amount_refunded: 0.5 }],
    ['transfer', { id: 'tr_other' }], ['transfer', { source_transaction: null }], ['transfer', { source_transaction: 'ch_other' }],
    ['transfer', { destination: 'acct_other' }], ['transfer', { destination_payment: null }],
    ['transfer', { amount: 5100 }], ['transfer', { currency: 'eur' }], ['transfer', { livemode: true }],
    ['transfer', { amount_reversed: -1 }], ['transfer', { amount_reversed: 6001 }],
    ['fee', { id: 'fee_other' }], ['fee', { account: 'acct_other' }], ['fee', { originating_transaction: 'ch_other' }],
    ['fee', { charge: 'ch_settlement' }], ['fee', { amount: 901 }], ['fee', { currency: 'eur' }], ['fee', { livemode: true }],
    ['fee', { amount_refunded: -1 }], ['fee', { amount_refunded: 901 }],
  ])('rejects mismatched %s receipt: %j', async (name, patch) => {
    Object.assign(f[name as string], patch)
    await expect(verify()).rejects.toBeInstanceOf(SettlementConflict)
  })
  it.each(['charge', 'transfer'])('rejects changed persisted %s identity', async name => {
    f.booking.payment[name === 'charge' ? 'stripeChargeId' : 'stripeTransferId'] = 'different'
    await expect(verify()).rejects.toBeInstanceOf(SettlementConflict)
  })
  it('rejects an event charge different from the current captured charge', async () => {
    await expect(verify('ch_other')).rejects.toBeInstanceOf(SettlementConflict)
  })
  it.each(['missing', 'retired', 'empty', 'destination', 'fee', 'amount', 'payment', 'metadata', 'split', 'booking-fee', 'net-transfer'])('refuses %s saved checkout evidence before provider access', async mode => {
    if (mode === 'missing') f.attempt = null
    if (mode === 'retired') f.attempt.retiredAt = new Date()
    if (mode === 'empty') f.attempt.parameters = {}
    if (mode === 'destination') f.attempt.parameters.payment_intent_data.transfer_data.destination = ''
    if (mode === 'fee') f.attempt.parameters.payment_intent_data.application_fee_amount++
    if (mode === 'amount') f.attempt.parameters.line_items[0].price_data.unit_amount++
    if (mode === 'payment') f.attempt.paymentId = 'other'
    if (mode === 'metadata') f.attempt.parameters.payment_intent_data.metadata.checkoutAttemptId = 'other'
    if (mode === 'split') f.booking.payment.trainerPayoutInCents++
    if (mode === 'booking-fee') f.booking.platformFeeInCents++
    if (mode === 'net-transfer') f.attempt.parameters.payment_intent_data.transfer_data.amount = 5100
    await expect(verify()).rejects.toBeInstanceOf(SettlementConflict)
    expect(provider.intent).not.toHaveBeenCalled()
  })
  it.each(['charge', 'fee'])('requires retry when the %s has no settlement receipt yet', async name => {
    f.charge[name === 'charge' ? 'transfer' : 'application_fee'] = null
    await expect(verify()).rejects.toThrow('retry required')
  })
  it.each(['intent', 'charge', 'transfer', 'fee'] as const)('propagates %s provider failure without inferring settlement', async name => {
    provider[name].mockRejectedValueOnce(new Error('provider unavailable'))
    await expect(verify()).rejects.toThrow('provider unavailable')
  })
  it.each([
    ['charge', { amount_refunded: 1000 }, true], ['charge', { refunded: true, amount_refunded: 6000 }, true],
    ['charge', { disputed: true }, false], ['transfer', { reversed: true, amount_reversed: 6000 }, false],
    ['transfer', { amount_reversed: 500 }, false], ['fee', { refunded: true, amount_refunded: 900 }, false],
    ['fee', { amount_refunded: 100 }, false],
  ])('returns review-required for %s financial activity %j', async (name, patch, hasRefunds) => {
    Object.assign(f[name as string], patch)
    expect(await verify()).toMatchObject({ requiresReview: true, hasRefunds })
  })
  it('supports an explicitly saved zero-fee destination charge without inventing a fee receipt', async () => {
    f.booking.platformFeeInCents = f.booking.payment.platformFeeInCents = 0
    f.booking.trainerPayoutInCents = f.booking.payment.trainerPayoutInCents = 6000
    f.attempt.parameters.payment_intent_data.application_fee_amount = 0
    f.intent.application_fee_amount = f.charge.application_fee_amount = null
    f.charge.application_fee = null
    expect((await verify()).requiresReview).toBe(false)
    expect(provider.fee).not.toHaveBeenCalled()
    f.charge.application_fee = 'fee_unexpected'
    await expect(verify()).rejects.toThrow('zero-fee')
  })
})
