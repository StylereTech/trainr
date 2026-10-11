import { Temporal } from '@js-temporal/polyfill'
import { canonicalTimeZone } from '@/lib/time-zone'

export const PAID_BOOKING_LEAD_MS = 31 * 60 * 1000

export function resolveBookingTime(date: string, startTime: string, durationMinutes: number, zone: unknown) {
  const timeZone = canonicalTimeZone(zone)
  if (!timeZone) throw new Error('The trainer must choose a schedule time zone before booking.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(startTime) ||
      !Number.isInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 480) throw new Error('Invalid session date, time or duration.')
  const start = Temporal.PlainDateTime.from(`${date}T${startTime}`, { overflow: 'reject' })
  const end = start.add({ minutes: durationMinutes })
  const midnight = start.toPlainDate().add({ days: 1 }).toPlainDateTime()
  if (Temporal.PlainDateTime.compare(end, midnight) > 0) throw new Error('Sessions must end within the selected day.')
  let startsAt: Date, endsAt: Date
  try {
    startsAt = new Date(start.toZonedDateTime(timeZone, { disambiguation: 'reject' }).epochMilliseconds)
    endsAt = new Date(end.toZonedDateTime(timeZone, { disambiguation: 'reject' }).epochMilliseconds)
    // Keep the purchased duration equal to elapsed time as well as displayed clock time.
    if (endsAt.getTime() - startsAt.getTime() !== durationMinutes * 60000) throw new Error('Offset transition')
  } catch {
    throw new Error('This time crosses a clock change or is ambiguous. Choose another session time.')
  }
  const endTime = Temporal.PlainDateTime.compare(end, midnight) === 0 ? '24:00' : end.toPlainTime().toString({ smallestUnit: 'minute' })
  return { timeZone, startsAt, endsAt, endTime }
}

export function hasBookingTime(booking: { timeZone?: string | null; startsAt?: Date | null; endsAt?: Date | null }) {
  return !!canonicalTimeZone(booking.timeZone) && booking.startsAt instanceof Date && booking.endsAt instanceof Date &&
    Number.isFinite(booking.startsAt.getTime()) && booking.endsAt.getTime() > booking.startsAt.getTime()
}

export function checkoutTimeError(booking: { timeZone?: string | null; startsAt?: Date | null; endsAt?: Date | null }, now = Date.now()) {
  if (!hasBookingTime(booking)) return 'This booking needs its original time zone confirmed by support before payment.'
  if (booking.startsAt!.getTime() <= now) return 'This session has already started. Choose a future session before paying.'
  return null
}

export function bookingDates(timeZone: unknown, now = Date.now()) {
  const zone = canonicalTimeZone(timeZone)
  if (!zone) return []
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate()
  return Array.from({ length: 14 }, (_, i) => today.add({ days: i + 1 }).toString())
}
