import { canonicalTimeZone } from '@/lib/time-zone'

export type BookingOutcomeTiming = {
  timeZone?: string | null
  startsAt?: string | Date | null
  endsAt?: string | Date | null
}

const timestamp = (value: string | Date | null | undefined) => value instanceof Date
  ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN

export function bookingOutcomeTimeError(booking: BookingOutcomeTiming, action: 'complete' | 'no_show', now = Date.now()) {
  const start = timestamp(booking.startsAt), end = timestamp(booking.endsAt)
  if (!canonicalTimeZone(booking.timeZone) || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(now)) {
    return 'The original session time needs confirmation by support before recording an outcome.'
  }
  if (action === 'complete' && now < end) return 'This session has not ended yet.'
  if (action === 'no_show' && now < start) return 'This session has not started yet.'
  return null
}
