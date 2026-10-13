import { describe, expect, it } from 'vitest'
import { creditBookingSchema, creditBookingResult, creditBookingOptions } from '@/lib/package-credit-booking-schema'

const request = { requestId: '1d13d21b-a6b1-4b4c-b6a0-6c6162537262', purchaseId: 'purchase', serviceOfferingId: 'service',
  athleteProfileId: 'child', date: '2030-11-04', startTime: '09:00', timeZone: 'UTC' }
describe('credit reservation contract', () => {
  it('accepts one explicitly selected owned purchase, service and child', () => { expect(creditBookingSchema.parse(request)).toEqual(request) })
  it.each(['couponCode', 'expectedTotalInCents', 'packageId', 'parentProfileId', 'status', 'restoredAt', 'payment'])('does not accept caller-supplied %s', field => {
    expect(creditBookingSchema.safeParse({ ...request, [field]: 'unsupported' }).success).toBe(false)
  })
  it.each([{ purchaseId: '' }, { requestId: 'invalid' }, { date: '2030-02-30' }, { startTime: '24:00' }, { timeZone: 'invalid' }, { notes: 'x'.repeat(2001) }])('rejects malformed input %j', change => {
    expect(creditBookingSchema.safeParse({ ...request, ...change }).success).toBe(false)
  })
  it('does not accept an unverified success without credit funding', () => {
    expect(creditBookingResult.safeParse({ id: 'booking', status: 'CONFIRMED' }).success).toBe(false)
    expect(creditBookingResult.safeParse({ id: 'booking', status: 'CONFIRMED', creditFunding: null }).success).toBe(false)
  })
  it('rejects provider details accidentally added to the options response', () => {
    expect(creditBookingOptions.safeParse({ purchaseId: 'purchase', title: 'Training', expiresAt: null, hold: 'Needs review', trainerName: 'Trainer', timeZone: 'UTC',
      services: [], athletes: [], slots: [], stripePaymentIntentId: 'pi_private' }).success).toBe(false)
  })
})
