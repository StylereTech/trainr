import { describe, expect, it } from 'vitest'
import { packagePurchaseRequestSchema, packagePurchaseTermsSchema } from '@/lib/package-purchase-schema'

const request = { requestId: '81cd58ec-ce77-4153-8a53-ced9c568bb49', packageId: 'package',
  catalogRevision: '2026-10-11T19:00:00.000Z', expectedTotalInCents: 25000 }
const item = { serviceOfferingId: 'service', title: 'Training', sportId: 'sport', durationMinutes: 60, type: 'INDIVIDUAL', sessionsCount: 5 }
const terms = { version: 1, title: 'Five sessions', description: '', validForDays: 90, totalSessions: 5, items: [item] }

describe('family-shared package purchase contracts', () => {
  it('accepts a reviewed package without selecting a child', () => {
    expect(packagePurchaseRequestSchema.parse(request)).toEqual(request)
    expect(packagePurchaseTermsSchema.parse(terms)).toEqual(terms)
  })
  it.each(['athleteProfileId', 'parentProfileId', 'trainerProfileId', 'status', 'terms', 'platformFeeInCents', 'creditBalance'])('rejects caller-supplied %s', key => {
    expect(packagePurchaseRequestSchema.safeParse({ ...request, [key]: 'untrusted' }).success).toBe(false)
  })
  it.each([
    { requestId: 'not-a-uuid' }, { packageId: '' }, { catalogRevision: 'yesterday' },
    { expectedTotalInCents: 49 }, { expectedTotalInCents: 100000000 }, { expectedTotalInCents: 25000.5 },
  ])('rejects invalid purchase input %j', change => {
    expect(packagePurchaseRequestSchema.safeParse({ ...request, ...change }).success).toBe(false)
  })
  it.each([
    { version: 2 }, { totalSessions: 6 }, { totalSessions: 0 }, { validForDays: 0 }, { validForDays: 3651 },
    { items: [] }, { title: '' }, { athleteProfileId: 'child' },
    { items: [item, item], totalSessions: 10 },
    { items: [{ ...item, sessionsCount: -1 }], totalSessions: -1 },
    { items: [{ ...item, durationMinutes: 0 }] }, { items: [{ ...item, type: 'unsupported' }] },
    { items: [{ ...item, sportId: null }] },
  ])('rejects malformed stored terms %j', change => {
    expect(packagePurchaseTermsSchema.safeParse({ ...terms, ...change }).success).toBe(false)
  })
  it('preserves separate service quantities rather than a fungible total', () => {
    const mixed = { ...terms, totalSessions: 8, items: [item, { ...item, serviceOfferingId: 'second', sessionsCount: 3 }] }
    expect(packagePurchaseTermsSchema.parse(mixed).items.map(value => value.sessionsCount)).toEqual([5, 3])
  })
})
