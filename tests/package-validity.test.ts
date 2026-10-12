import { describe, expect, it } from 'vitest'
import { approvedPackageCreditPolicy, packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'
import { packageValidity } from '@/lib/package-validity'

const terms = packagePurchaseTermsSchema.parse({ version: 2, creditPolicy: approvedPackageCreditPolicy,
  title: 'Synthetic package', description: '', validForDays: 90, totalSessions: 1,
  items: [{ serviceOfferingId: 'service', title: 'Training', sportId: 'sport', durationMinutes: 60, type: 'INDIVIDUAL', sessionsCount: 1 }] })
describe('package validity from verified payment success', () => {
  it('does not infer validity without a success receipt', () => {
    expect(packageValidity(terms, null)).toBeNull()
    expect(packageValidity(terms, new Date('invalid'))).toBeNull()
  })
  it('does not impose new policy on legacy purchases', () => {
    const { creditPolicy: _policy, ...legacy } = terms as Extract<typeof terms, { version: 2 }>
    expect(packageValidity(packagePurchaseTermsSchema.parse({ ...legacy, version: 1 }), new Date())).toBeNull()
  })
  it.each(['2026-03-08T09:30:00.000Z', '2026-11-01T08:30:00.000Z', '2028-02-29T12:00:00.000Z'])('uses elapsed days across DST and leap dates: %s', date => {
    const paidAt = new Date(date), result = packageValidity(terms, paidAt)!
    expect(result.startsAt).toEqual(paidAt)
    expect(result.expiresAt.getTime() - paidAt.getTime()).toBe(90 * 86400000)
    expect(paidAt.toISOString()).toBe(date)
  })
})
