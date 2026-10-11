const calendarDate = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })

// Booking.date stores a calendar day at UTC midnight, not a session-start instant.
export function formatBookingDate(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value
  return Number.isFinite(date.getTime()) ? calendarDate.format(date) : 'Date unavailable'
}
