import { describe, expect, it } from 'vitest'
import { isTimeSlotAvailable, timeToMinutes } from '@/lib/availability'
import { generateAvailableTimeSlots } from '@/lib/trainer'
import { bookingSchema } from '@/lib/validations'

const date = new Date('2026-11-02T00:00:00Z')
const weekly = { dayOfWeek: 1, specificDate: null, startTime: '09:00', endTime: '12:00', isRecurring: true, isAvailable: true }

describe('shared availability rules', () => {
  it('lets blackout windows veto weekly windows in either order', () => {
    const blackout = { ...weekly, specificDate: date, isAvailable: false, startTime: '09:30', endTime: '10:30' }
    for (const slots of [[weekly, blackout], [blackout, weekly]]) {
      expect(isTimeSlotAvailable(slots, date, '09:00', 60)).toBe(false)
      expect(isTimeSlotAvailable(slots, date, '10:30', 60)).toBe(true)
      expect(generateAvailableTimeSlots(slots, '2026-11-02', 60)).toEqual(['11:00'])
    }
  })
  it('supports one-off windows and deduplicates sorted times', () => {
    const once = { ...weekly, dayOfWeek: null, specificDate: date, isRecurring: false, startTime: '08:00', endTime: '10:00' }
    expect(generateAvailableTimeSlots([weekly, once, weekly], '2026-11-02', 60)).toEqual(['08:00', '09:00', '10:00', '11:00'])
    expect(generateAvailableTimeSlots([once], '2026-11-09', 60)).toEqual([])
  })
  it('does not generate a start from an unrelated day\'s window', () => {
    expect(generateAvailableTimeSlots([weekly, { ...weekly, dayOfWeek: 2, startTime: '09:15' }], '2026-11-02', 60)).toEqual(['09:00', '10:00', '11:00'])
  })
  it('rejects non-recurring windows without a specific date', () => {
    expect(generateAvailableTimeSlots([{ ...weekly, isRecurring: false }], '2026-11-02', 60)).toEqual([])
  })
  it.each([0, -1, 0.5, NaN, Infinity, 1441])('rejects invalid duration %s', (duration) => {
    expect(isTimeSlotAvailable([weekly], date, '09:00', duration)).toBe(false)
    expect(generateAvailableTimeSlots([weekly], '2026-11-02', duration)).toEqual([])
  })
  it.each(['99:99', '24:01', '9:00', '09:60', 'NaN:00'])('rejects invalid clock input %s', (time) => {
    expect(timeToMinutes(time)).toBeNaN()
    expect(isTimeSlotAvailable([weekly], date, time, 60)).toBe(false)
  })
  it('allows midnight as an end, not a start or overnight overflow', () => {
    const slot = { ...weekly, startTime: '23:00', endTime: '24:00' }
    expect(isTimeSlotAvailable([slot], date, '23:00', 60)).toBe(true)
    expect(isTimeSlotAvailable([slot], date, '23:00', 61)).toBe(false)
    expect(isTimeSlotAvailable([slot], date, '24:00', 60)).toBe(false)
  })
  it.each(['2026-02-30', '2026-13-01', '2026-1-02', '', 'bad'])('rejects invalid date %s', (value) => {
    expect(generateAvailableTimeSlots([weekly], value, 60)).toEqual([])
    expect(bookingSchema.safeParse({ requestId: 'f9a4038f-506e-4c48-b77b-f50633128d7e', serviceOfferingId: 's', athleteProfileId: 'a', date: value, startTime: '09:00' }).success).toBe(false)
  })
})
