import { describe, expect, it } from 'vitest'
import { formatBookingDate } from '@/lib/booking-date'

describe('stored booking calendar dates', () => {
  for (const timezone of ['America/Los_Angeles', 'America/Chicago', 'Pacific/Honolulu', 'UTC', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    it(`preserves saved days in ${timezone}`, () => {
      const original = process.env.TZ
      process.env.TZ = timezone
      try {
        for (const [input, expected] of [
          ['2030-01-01', '1/1/2030'], ['2030-03-10', '3/10/2030'], ['2030-11-03', '11/3/2030'],
          ['2028-02-29', '2/29/2028'], ['2026-12-31', '12/31/2026'],
        ]) {
          expect(formatBookingDate(input)).toBe(expected)
          expect(formatBookingDate(`${input}T00:00:00.000Z`)).toBe(expected)
          expect(formatBookingDate(new Date(`${input}T00:00:00.000Z`))).toBe(expected)
        }
      } finally {
        if (original === undefined) delete process.env.TZ
        else process.env.TZ = original
      }
    })
  }
  it.each(['not-a-date', '', new Date(NaN)])('does not crash on invalid stored date %s', value => {
    expect(formatBookingDate(value)).toBe('Date unavailable')
  })
})
