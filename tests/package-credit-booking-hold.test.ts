import { beforeEach, describe, expect, it } from 'vitest'
import { packageCreditBookingHold } from '@/lib/package-credit-booking-hold'
import { approvedPackageCreditPolicy } from '@/lib/package-purchase-schema'

let booking: Parameters<typeof packageCreditBookingHold>[0]
beforeEach(() => {
  booking = {
    id: 'booking', parentProfileId: 'parent', trainerProfileId: 'trainer', serviceOfferingId: 'service',
    packageId: null, packageSessionNumber: null, totalAmountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0, payment: null,
    athleteProfileId: 'child', date: new Date('2026-01-02T00:00:00Z'), startTime: '10:00', endTime: '11:00', timeZone: 'UTC',
    status: 'CONFIRMED', location: null, notes: null, cancellationReason: null, rescheduledFromId: null,
    createdAt: new Date('2026-01-01T11:00:00Z'), updatedAt: new Date('2026-01-01T11:00:00Z'),
    startsAt: new Date('2026-01-02T10:00:00Z'), endsAt: new Date('2026-01-02T11:00:00Z'),
    creditRedemption: { bookingId: 'booking', purchaseId: 'purchase', serviceOfferingId: 'service',
      restoredAt: null, restoredByUserId: null, restorationReason: null, redeemedAt: new Date('2026-01-01T11:00:00Z'),
      grant: { purchaseId: 'purchase', serviceOfferingId: 'service', grantedAt: new Date('2026-01-01T10:00:00Z'), sessionsCount: 2,
        purchase: { id: 'purchase', parentProfileId: 'parent', trainerProfileId: 'trainer',
        packageId: 'package', requestId: 'request', payloadHash: 'a'.repeat(64), catalogRevision: new Date('2026-01-01T09:00:00Z'),
        amountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, refundsVerifiedAt: null,
        createdAt: new Date('2026-01-01T09:00:00Z'), updatedAt: new Date('2026-01-01T10:00:00Z'),
        status: 'SUCCEEDED', settlementVerifiedAt: new Date('2026-01-01T10:00:00Z'), financialReview: null,
        refundAmountInCents: 0, refundPendingAmountInCents: 0, refundFailedCount: 0,
        stripePaymentIntentId: 'pi_test', stripeChargeId: 'ch_test', stripeCheckoutSessionId: 'cs_test', stripeTransferId: 'tr_test',
        paymentReceipt: { purchaseId: 'purchase', stripeEventId: 'evt_test', livemode: false, recordedAt: new Date('2026-01-01T10:00:00Z'),
          paidAt: new Date('2026-01-01T10:00:00Z'), stripePaymentIntentId: 'pi_test', stripeChargeId: 'ch_test', stripeCheckoutSessionId: 'cs_test' },
        terms: { version: 2, title: 'Shared sessions', description: '', validForDays: 90, totalSessions: 2, creditPolicy: approvedPackageCreditPolicy,
          items: [{ serviceOfferingId: 'service', title: 'Training', sportId: 'sport', type: 'INDIVIDUAL', durationMinutes: 60, sessionsCount: 2 }] },
      } },
    },
  }
})

describe('credit booking outcome funding', () => {
  it('accepts historically valid funding without requiring a second payment or current unexpired balance', () => {
    expect(packageCreditBookingHold(booking)).toBeNull()
  })
  it.each(['totalAmountInCents', 'platformFeeInCents', 'trainerPayoutInCents'] as const)('rejects second %s', field => {
    booking[field] = 1
    expect(packageCreditBookingHold(booking)).not.toBeNull()
  })
  it.each(['payment', 'legacy-package', 'legacy-number', 'missing', 'restored', 'owner', 'trainer', 'service', 'booking', 'purchase', 'grant-count',
    'terms', 'policy', 'no-receipt', 'paid-after-spent', 'spent-after-start', 'spent-at-expiry', 'start-at-expiry', 'no-start', 'no-end', 'duration'])('holds malformed %s evidence', reason => {
    const credit = booking.creditRedemption!, purchase = credit.grant.purchase
    if (reason === 'payment') booking.payment = { status: 'SUCCEEDED' }
    if (reason === 'legacy-package') booking.packageId = 'legacy'
    if (reason === 'legacy-number') booking.packageSessionNumber = 1
    if (reason === 'missing') booking.creditRedemption = null
    if (reason === 'restored') credit.restoredAt = new Date()
    if (reason === 'owner') purchase.parentProfileId = 'another'
    if (reason === 'trainer') purchase.trainerProfileId = 'another'
    if (reason === 'service') credit.serviceOfferingId = 'another'
    if (reason === 'booking') credit.bookingId = 'another'
    if (reason === 'purchase') credit.purchaseId = 'another'
    if (reason === 'grant-count') credit.grant.sessionsCount = 3
    if (reason === 'terms') purchase.terms = { version: 2 }
    if (reason === 'policy') purchase.terms = { ...(purchase.terms as object), creditPolicy: {} }
    if (reason === 'no-receipt') purchase.paymentReceipt = null
    if (reason === 'paid-after-spent') purchase.paymentReceipt!.paidAt = new Date('2026-01-01T12:00:00Z')
    if (reason === 'spent-after-start') credit.redeemedAt = new Date('2026-01-02T10:00:00Z')
    if (reason === 'spent-at-expiry') credit.redeemedAt = new Date('2026-04-01T10:00:00Z')
    if (reason === 'start-at-expiry') { booking.startsAt = new Date('2026-04-01T10:00:00Z'); booking.endsAt = new Date('2026-04-01T11:00:00Z') }
    if (reason === 'no-start') booking.startsAt = null
    if (reason === 'no-end') booking.endsAt = null
    if (reason === 'duration') booking.endsAt = new Date('2026-01-02T12:00:00Z')
    expect(packageCreditBookingHold(booking)).not.toBeNull()
  })
})
