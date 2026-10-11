import { expect, it } from 'vitest'
import { bookingOutcomeTimeError } from '@/lib/booking-outcome-time'

const start = Date.parse('2030-11-04T17:00:00Z'), end = start + 3600000
const timing = { timeZone: 'America/Los_Angeles', startsAt: new Date(start), endsAt: new Date(end) }
for (const serialized of [false, true]) {
  const booking = serialized ? { ...timing, startsAt: timing.startsAt.toISOString(), endsAt: timing.endsAt.toISOString() } : timing
  it.each([
    ['complete', end - 1, false], ['complete', end, true], ['complete', end + 1, true],
    ['no_show', start - 1, false], ['no_show', start, true], ['no_show', start + 1, true],
  ] as const)(`${serialized ? 'browser' : 'database'} %s at %s is allowed=%s`, (action, now, allowed) => {
    expect(bookingOutcomeTimeError(booking, action, now) === null).toBe(allowed)
  })
}
it.each([
  { startsAt: null }, { endsAt: null }, { startsAt: 'not a timestamp' }, { endsAt: 'not a timestamp' },
  { endsAt: timing.startsAt }, { timeZone: 'unknown' }, { timeZone: null },
])('rejects missing or invalid saved timing %j', change => {
  expect(bookingOutcomeTimeError({ ...timing, ...change }, 'complete', end + 1)).toContain('confirmation by support')
})
it('fails closed for an invalid local clock', () => {
  expect(bookingOutcomeTimeError(timing, 'complete', NaN)).toContain('confirmation by support')
})
