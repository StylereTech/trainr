import { describe, expect, it } from 'vitest'
import { bookingDates, checkoutTimeError, resolveBookingTime } from '@/lib/booking-time'

describe('immutable booking instants', () => {
  it.each([
    ['America/New_York', '2030-11-04T14:00:00.000Z'],
    ['America/Los_Angeles', '2030-11-04T17:00:00.000Z'],
    ['Asia/Kathmandu', '2030-11-04T03:15:00.000Z'],
    ['Pacific/Kiritimati', '2030-11-03T19:00:00.000Z'],
  ])('resolves 09:00 in %s independently of the browser zone', (zone, expected) => {
    const result = resolveBookingTime('2030-11-04', '09:00', 60, zone)
    expect(result.startsAt.toISOString()).toBe(expected)
    expect(result.endsAt.getTime() - result.startsAt.getTime()).toBe(3600000)
    expect(result.endTime).toBe('10:00')
  })
  it.each([
    ['2030-03-10', '02:00', 60], ['2030-11-03', '01:00', 60],
    ['2030-03-10', '01:00', 120], ['2030-11-03', '00:00', 180],
  ])('rejects missing, repeated or offset-crossing intervals %s %s', (date, time, duration) => {
    expect(() => resolveBookingTime(date, time, duration, 'America/New_York')).toThrow(/clock change|ambiguous/)
  })
  it('supports midnight ends without admitting overnight sessions', () => {
    expect(resolveBookingTime('2030-11-04', '23:00', 60, 'UTC')).toMatchObject({ endTime: '24:00', endsAt: new Date('2030-11-05T00:00:00Z') })
    expect(() => resolveBookingTime('2030-11-04', '23:30', 60, 'UTC')).toThrow('selected day')
  })
  it.each([null, '', 'EST', '+05:30', 'Invalid/Zone'])('does not guess an unknown zone %s', zone => {
    expect(() => resolveBookingTime('2030-11-04', '09:00', 60, zone)).toThrow('choose')
    expect(bookingDates(zone)).toEqual([])
  })
  it('starts the calendar tomorrow in the trainer zone, including across UTC dates', () => {
    const now = Date.parse('2030-11-04T06:00:00Z')
    expect(bookingDates('America/Los_Angeles', now)[0]).toBe('2030-11-04')
    expect(bookingDates('Pacific/Kiritimati', now)[0]).toBe('2030-11-05')
    expect(bookingDates('UTC', now)).toHaveLength(14)
  })
  it('blocks unknown or started sessions at the payment boundary', () => {
    const booking = resolveBookingTime('2030-11-04', '09:00', 60, 'UTC')
    expect(checkoutTimeError({})).toContain('support')
    expect(checkoutTimeError(booking, booking.startsAt.getTime())).toContain('already started')
    expect(checkoutTimeError(booking, booking.startsAt.getTime() - 1)).toBeNull()
  })
})
