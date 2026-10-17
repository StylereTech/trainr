import { describe, expect, it } from 'vitest'
import { bookingPaymentHold, type BookingPaymentState } from '@/lib/booking-payment-hold'

const paid: BookingPaymentState = { status: 'SUCCEEDED', refundAmountInCents: 0, refundPendingAmountInCents: 0,
  refundFailedCount: 0, financialReview: null, settlementVerifiedAt: '2026-10-12T00:00:00.000Z' }
describe('shared booking payment hold contract', () => {
  it('accepts verified positive payments and intentional zero-due reservations', () => {
    expect(bookingPaymentHold({ totalAmountInCents: 6000, payment: paid })).toBeNull()
    expect(bookingPaymentHold({ totalAmountInCents: 0, payment: { ...paid, settlementVerifiedAt: null } })).toBeNull()
  })
  it.each([undefined, null, '', 'invalid', new Date('invalid')])('holds unverified success %s', settlementVerifiedAt => {
    expect(bookingPaymentHold({ totalAmountInCents: 6000, payment: { ...paid, settlementVerifiedAt } })).toContain('verification')
  })
  it.each([{ financialReview: true }, { financialReview: { key: 'dispute' } }, { refundAmountInCents: 1 },
    { refundPendingAmountInCents: 1 }, { refundFailedCount: 1 }])('retains financial hold %j despite succeeded status', change => {
    expect(bookingPaymentHold({ totalAmountInCents: 6000, payment: { ...paid, ...change } })).toContain('reconciliation')
  })
  it.each(['PENDING', 'PROCESSING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED'])('holds status %s', status => {
    expect(bookingPaymentHold({ totalAmountInCents: 6000, payment: { ...paid, status } })).not.toBeNull()
  })
})
