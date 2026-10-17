import { beforeEach, describe, expect, it } from 'vitest'
import { packageCreditBookingHold, packageCreditFunding } from '@/lib/package-credit-booking-hold'
import { approvedPackageCreditPolicy } from '@/lib/package-purchase-schema'
import type { Booking } from '@prisma/client'
import { bookingPaymentHold } from '@/lib/booking-payment-hold'
import { packageCreditFundingSchema } from '@/lib/dashboard-contract'

let booking: Parameters<typeof packageCreditBookingHold>[0] & Booking
beforeEach(() => {
  booking = {
    id: 'booking', parentProfileId: 'parent', trainerProfileId: 'trainer', serviceOfferingId: 'service',
    packageId: null, packageSessionNumber: null, couponId: null, totalAmountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0, payment: null,
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
  it.each([false, 0, ''])('holds non-null falsy review %j consistently with the SQL debit guard', review => {
    booking.creditRedemption!.grant.purchase.financialReview = review
    expect(packageCreditBookingHold(booking, false)).toContain('reconciliation')
    expect(packageCreditFunding(booking, false)?.hold).toContain('reconciliation')
  })
  it('projects only safe funding fields and enables funded outcome controls', () => {
    const creditFunding = packageCreditFunding(booking, false)
    expect(creditFunding).toEqual({ kind: 'PACKAGE_CREDIT', purchaseId: 'purchase', packageTitle: 'Shared sessions', restoredAt: null, hold: null })
    expect(packageCreditFundingSchema.parse(creditFunding)).toEqual(creditFunding)
    expect(bookingPaymentHold({ totalAmountInCents: 0, payment: null, creditFunding })).toBeNull()
  })
  it('does not expose raw review or Stripe receipt details', () => {
    booking.creditRedemption!.grant.purchase.financialReview = { secret: 'private-review-detail' }
    const creditFunding = packageCreditFunding(booking, false)
    expect(creditFunding!.hold).toContain('reconciliation')
    expect(JSON.stringify(creditFunding)).not.toMatch(/private-review-detail|pi_test|ch_test|cs_test|tr_test/)
    expect(bookingPaymentHold({ totalAmountInCents: 0, payment: null, creditFunding })).toEqual(creditFunding!.hold)
  })
  it('keeps restoration history distinct from usable booking funding', () => {
    booking.creditRedemption!.restoredAt = new Date('2026-01-01T12:00:00Z')
    const creditFunding = packageCreditFunding(booking, false)
    expect(creditFunding).toMatchObject({ restoredAt: '2026-01-01T12:00:00.000Z', hold: null })
    expect(bookingPaymentHold({ totalAmountInCents: 0, payment: null, creditFunding })).toContain('returned')
  })
  it('does not infer credits from a missing cash payment', () => {
    booking.creditRedemption = null
    expect(packageCreditFunding(booking, false)).toBeNull()
    expect(bookingPaymentHold({ totalAmountInCents: 0, payment: null })).not.toBeNull()
  })
  it.each([{ restoredAt: 'invalid' }, { hold: undefined }, { kind: 'CASH' }, { stripePaymentIntentId: 'pi_private' }])('rejects malformed projected credit fields %j', change => {
    expect(packageCreditFundingSchema.safeParse({ ...packageCreditFunding(booking, false), ...change }).success).toBe(false)
  })
  it('does not enable outcomes on a contradictory dual-funded display record', () => {
    expect(bookingPaymentHold({ totalAmountInCents: 1, payment: null, creditFunding: packageCreditFunding(booking, false) })).toContain('reconciliation')
    expect(bookingPaymentHold({ totalAmountInCents: 0, payment: { status: 'SUCCEEDED', refundAmountInCents: 0 }, creditFunding: packageCreditFunding(booking, false) })).toContain('reconciliation')
  })
  it('accepts historically valid funding without requiring a second payment or current unexpired balance', () => {
    expect(packageCreditBookingHold(booking, false)).toBeNull()
  })
  it.each(['totalAmountInCents', 'platformFeeInCents', 'trainerPayoutInCents'] as const)('rejects second %s', field => {
    booking[field] = 1
    expect(packageCreditBookingHold(booking, false)).not.toBeNull()
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
    expect(packageCreditBookingHold(booking, false)).not.toBeNull()
  })
  it('retains SQL-present JSON null despite Prisma decoding it as null', () => {
    expect(booking.creditRedemption!.grant.purchase.financialReview).toBeNull()
    expect(packageCreditBookingHold(booking, true)).toContain('reconciliation')
    expect(packageCreditFunding(booking, true)?.hold).toContain('reconciliation')
    expect(packageCreditBookingHold(booking, false)).toBeNull()
  })
})
