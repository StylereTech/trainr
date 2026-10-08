import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBooking } from '@/lib/booking-creation'

const mock = vi.hoisted(() => ({ transaction: vi.fn(), query: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: mock.transaction } }))

let state: any
let fail: string | null
const input = { serviceOfferingId: 'service', athleteProfileId: 'athlete', date: '2026-11-02', startTime: '09:00' }
const reserve = (overrides = {}) => createBooking('parent-user', { ...input, ...overrides })

beforeEach(() => {
  vi.resetAllMocks()
  fail = null
  state = {
    parent: { id: 'parent', user: { email: 'parent@example.test' } },
    service: { id: 'service', trainerProfileId: 'trainer', sportId: 'sport', title: 'Training', type: 'INDIVIDUAL',
      priceInCents: 6000, durationMinutes: 60, maxParticipants: 1, isActive: true,
      sport: { isActive: true }, trainerProfile: { id: 'trainer', userId: 'trainer-user', isActive: true, approvalStatus: 'APPROVED', sports: [{ sportId: 'sport' }] } },
    athletes: ['athlete', 'athlete2', 'athlete3'].map((id) => ({ id, parentProfileId: 'parent', sports: [{ sportId: 'sport' }] })),
    slots: [{ dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '12:00', isRecurring: true, isAvailable: true }],
    coupon: { id: 'coupon', code: 'SAVE10', discountPercent: 10, discountAmountInCents: null,
      currentUses: 0, maxUses: 1, expiresAt: null, isActive: true, applicableSportId: null },
    bookings: [], notifications: [], fees: [],
  }
  let tail = Promise.resolve()
  // Models serialized transactions and rollback; real PostgreSQL locking needs staging verification.
  mock.transaction.mockImplementation(async (run) => {
    const previous = tail
    let release!: () => void
    tail = new Promise<void>((resolve) => { release = resolve })
    await previous
    const before = structuredClone(state)
    try {
      return await run({
        $queryRaw: mock.query,
        feeConfig: { findMany: async () => state.fees },
        parentProfile: { findUnique: async () => state.parent },
        serviceOffering: { findUnique: async () => state.service },
        athleteProfile: { findFirst: async ({ where }: any) => state.athletes.find((a: any) => a.id === where.id && a.parentProfileId === where.parentProfileId) },
        availabilitySlot: { findMany: async () => state.slots },
        booking: {
          findMany: async ({ where }: any) => state.bookings.filter((b: any) =>
            b.date.getTime() === where.date.getTime() && !where.status.notIn.includes(b.status) &&
            where.OR.some((clause: any) => Object.entries(clause).every(([key, value]) => b[key] === value))),
          create: async ({ data }: any) => {
            if (fail === 'booking') throw new Error('booking insert failed')
            const booking = { id: `booking-${state.bookings.length}`, ...data }
            state.bookings.push(booking)
            return booking
          },
        },
        coupon: {
          findUnique: async ({ where }: any) => state.coupon?.code === where.code ? state.coupon : null,
          update: async () => { state.coupon.currentUses++ },
        },
        notification: { create: async ({ data }: any) => {
          if (fail === 'notification') throw new Error('notification insert failed')
          state.notifications.push(data)
        } },
      })
    } catch (error) {
      state = before
      throw error
    } finally { release() }
  })
})

describe('atomic reservation creation', () => {
  it.each(['unassigned', 'inactive', 'removed'])('rejects a service with %s sport before consuming a coupon or creating records', async (condition) => {
    if (condition === 'unassigned') state.service.sportId = null
    if (condition === 'inactive') state.service.sport.isActive = false
    if (condition === 'removed') state.service.trainerProfile.sports = []
    await expect(reserve({ couponCode: 'SAVE10' })).rejects.toMatchObject({ status: 409 })
    expect(state.coupon.currentUses).toBe(0)
    expect(state.bookings).toHaveLength(0)
    expect(state.notifications).toHaveLength(0)
  })
  it('uses the configured commission on the discounted total', async () => {
    state.fees = [{ platformCommissionPercent: 20, stripeFeePercent: 5, processingFeeCents: 99, minBookingAmountCents: 1500 }]
    expect(await reserve({ couponCode: 'SAVE10' })).toMatchObject({ totalAmountInCents: 5400, platformFeeInCents: 1080, trainerPayoutInCents: 4320 })
  })
  it('rejects a service below the configured minimum before spending a coupon', async () => {
    state.fees = [{ platformCommissionPercent: 20, stripeFeePercent: 2.9, processingFeeCents: 30, minBookingAmountCents: 7000 }]
    await expect(reserve({ couponCode: 'SAVE10' })).rejects.toMatchObject({ status: 409 })
    expect(state.coupon.currentUses).toBe(0)
    expect(state.bookings).toHaveLength(0)
  })
  it('creates a pending reservation with exact fee split and no fabricated payment', async () => {
    expect(await reserve()).toMatchObject({ status: 'PENDING', totalAmountInCents: 6000, platformFeeInCents: 900, trainerPayoutInCents: 5100, endTime: '10:00' })
    expect(state.bookings[0].payment).toBeUndefined()
    expect(state.notifications).toHaveLength(1)
    expect(mock.query.mock.calls.slice(0, 3).map((call) => call[0].join('?'))).toEqual([
      'SELECT id FROM trainer_profiles WHERE id = ? FOR UPDATE',
      'SELECT id FROM service_offerings WHERE id = ? FOR UPDATE',
      'SELECT id FROM athlete_profiles WHERE id = ? FOR UPDATE',
    ])
  })

  it('allows only one overlapping individual reservation in the serialized model', async () => {
    const results = await Promise.allSettled([reserve(), reserve({ athleteProfileId: 'athlete2' })])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(state.bookings).toHaveLength(1)
  })

  it('allows adjacent sessions', async () => {
    await reserve()
    await reserve({ startTime: '10:00' })
    expect(state.bookings).toHaveLength(2)
  })

  it('enforces group capacity without rejecting another athlete in the same group', async () => {
    Object.assign(state.service, { type: 'GROUP', maxParticipants: 2 })
    await reserve()
    await reserve({ athleteProfileId: 'athlete2' })
    await expect(reserve({ athleteProfileId: 'athlete3' })).rejects.toMatchObject({ status: 409 })
    expect(state.bookings).toHaveLength(2)
  })

  it('does not admit the same athlete twice to a group', async () => {
    Object.assign(state.service, { type: 'GROUP', maxParticipants: 3 })
    await reserve()
    await expect(reserve()).rejects.toThrow('athlete already')
  })

  it('rejects a group with a different overlapping start time', async () => {
    Object.assign(state.service, { type: 'GROUP', maxParticipants: 3 })
    await reserve()
    await expect(reserve({ startTime: '09:30', athleteProfileId: 'athlete2' })).rejects.toMatchObject({ status: 409 })
  })

  it('rejects an athlete already booked with another trainer', async () => {
    state.bookings.push({ ...input, date: new Date(input.date), trainerProfileId: 'other', endTime: '10:00', status: 'CONFIRMED' })
    await expect(reserve()).rejects.toThrow('athlete already')
  })

  it.each(['CANCELLED', 'RESCHEDULED'])('ignores a %s reservation', async (status) => {
    state.bookings.push({ ...input, date: new Date(input.date), trainerProfileId: 'trainer', endTime: '10:00', status })
    await expect(reserve()).resolves.toMatchObject({ status: 'PENDING' })
  })

  it.each(['PENDING', 'REJECTED', 'SUSPENDED'])('rejects a trainer whose approval is %s', async (approvalStatus) => {
    state.service.trainerProfile.approvalStatus = approvalStatus
    await expect(reserve()).rejects.toMatchObject({ status: 409 })
    expect(state.bookings).toHaveLength(0)
  })

  it.each(['service', 'trainer'])('rejects an inactive %s', async (target) => {
    if (target === 'service') state.service.isActive = false
    else state.service.trainerProfile.isActive = false
    await expect(reserve()).rejects.toMatchObject({ status: 409 })
  })

  it('rejects another parent\'s athlete', async () => {
    state.athletes[0].parentProfileId = 'other-parent'
    await expect(reserve()).rejects.toMatchObject({ status: 404 })
  })

  it('rejects an athlete not registered for the offered sport', async () => {
    state.athletes[0].sports = []
    await expect(reserve()).rejects.toMatchObject({ status: 400 })
  })

  it('checks blackout windows even when a recurring window matches', async () => {
    state.slots.push({ ...state.slots[0], specificDate: new Date(input.date), isAvailable: false, startTime: '09:30', endTime: '10:30' })
    await expect(reserve()).rejects.toThrow('not available')
  })

  it('normalizes coupon codes and commits the discount with the reservation', async () => {
    expect(await reserve({ couponCode: 'save-10' })).toMatchObject({ totalAmountInCents: 5400, platformFeeInCents: 810, trainerPayoutInCents: 4590 })
    expect(state.coupon.currentUses).toBe(1)
  })

  it.each([1, 49])('rolls back a coupon leaving an unchargeable %s-cent balance', async (remaining) => {
    Object.assign(state.coupon, { discountPercent: null, discountAmountInCents: 6000 - remaining })
    await expect(reserve({ couponCode: 'SAVE10' })).rejects.toMatchObject({ status: 400, message: expect.stringContaining('$0.50') })
    expect(state.coupon.currentUses).toBe(0)
    expect(state.bookings).toHaveLength(0)
    expect(state.notifications).toHaveLength(0)
  })

  it('rejects a percentage discount leaving a sub-minimum charge', async () => {
    state.service.priceInCents = 1500
    state.coupon.discountPercent = 99
    await expect(reserve({ couponCode: 'SAVE10' })).rejects.toMatchObject({ status: 400 })
    expect(state.coupon.currentUses).toBe(0)
  })

  it('accepts an exact 50-cent balance without altering the discount', async () => {
    Object.assign(state.coupon, { discountPercent: null, discountAmountInCents: 5950 })
    expect(await reserve({ couponCode: 'SAVE10' })).toMatchObject({ status: 'PENDING', totalAmountInCents: 50, platformFeeInCents: 8, trainerPayoutInCents: 42 })
    expect(state.coupon.currentUses).toBe(1)
  })

  it.each([49, 100000000])('rejects unsupported legacy service price %s without a coupon', async (price) => {
    state.service.priceInCents = price
    await expect(reserve()).rejects.toMatchObject({ status: price < 1500 ? 409 : 400 })
    expect(state.bookings).toHaveLength(0)
  })

  it.each(['booking', 'notification'])('rolls back coupon usage and reservation if %s creation fails', async (failure) => {
    fail = failure
    await expect(reserve({ couponCode: 'SAVE10' })).rejects.toThrow('failed')
    expect(state.coupon.currentUses).toBe(0)
    expect(state.bookings).toHaveLength(0)
    expect(state.notifications).toHaveLength(0)
  })

  it('does not oversubscribe a coupon in the serialized model', async () => {
    const results = await Promise.allSettled([reserve({ couponCode: 'SAVE10' }), reserve({ couponCode: 'SAVE10', startTime: '10:00' })])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(state.coupon.currentUses).toBe(1)
    expect(state.bookings).toHaveLength(1)
  })

  it.each([
    { isActive: false }, { currentUses: 1 }, { expiresAt: new Date(0) }, { applicableSportId: 'other-sport' },
    { discountPercent: 101 }, { discountPercent: 0 }, { discountAmountInCents: 100 }, { discountPercent: null },
  ])('rejects unusable coupon settings %j', async (settings) => {
    Object.assign(state.coupon, settings)
    await expect(reserve({ couponCode: 'SAVE10' })).rejects.toMatchObject({ status: 400 })
    expect(state.bookings).toHaveLength(0)
  })

  it('does not silently charge full price for an unknown coupon', async () => {
    await expect(reserve({ couponCode: 'MISSING' })).rejects.toMatchObject({ status: 400 })
  })

  it.each([{ discountPercent: 100 }, { discountPercent: null, discountAmountInCents: 9000 }])('confirms a zero-due booking without a Stripe charge %j', async (discount) => {
    Object.assign(state.coupon, discount)
    const booking = await reserve({ couponCode: 'SAVE10' })
    expect(booking).toMatchObject({ status: 'CONFIRMED', totalAmountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0,
      payment: { create: { status: 'SUCCEEDED', amountInCents: 0, platformFeeInCents: 0, trainerPayoutInCents: 0 } } })
    expect(state.notifications[0].message).toContain('no Stripe charge or trainer payout')
  })
})
