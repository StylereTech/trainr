/**
 * Trainer availability validation helpers.
 * Validates that a booking request falls within real trainer availability slots.
 */

interface AvailabilitySlot {
  dayOfWeek: number | null
  specificDate: Date | null
  startTime: string // "HH:MM"
  endTime: string   // "HH:MM"
  isRecurring: boolean
  isAvailable: boolean
}

/**
 * Convert "HH:MM" to minutes since midnight.
 */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/**
 * Convert minutes since midnight to "HH:MM".
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/**
 * Check if a booking request fits within any of the trainer's availability slots.
 *
 * @param slots - The trainer's availability slots
 * @param bookingDate - The requested booking date
 * @param startTime - Requested start time "HH:MM"
 * @param durationMinutes - Session duration
 * @returns true if the booking fits within an available slot
 */
export function isTimeSlotAvailable(
  slots: AvailabilitySlot[],
  bookingDate: Date,
  startTime: string,
  durationMinutes: number
): boolean {
  const bookingDayOfWeek = bookingDate.getUTCDay() // 0=Sunday, 6=Saturday
  const requestedStart = timeToMinutes(startTime)
  const requestedEnd = requestedStart + durationMinutes

  for (const slot of slots) {
    if (!slot.isAvailable) continue

    // Check if slot matches the date
    let dateMatches = false

    if (slot.specificDate) {
      // One-off slot: compare dates (ignore time portion)
      const slotDate = new Date(slot.specificDate)
      dateMatches =
        slotDate.getUTCFullYear() === bookingDate.getUTCFullYear() &&
        slotDate.getUTCMonth() === bookingDate.getUTCMonth() &&
        slotDate.getUTCDate() === bookingDate.getUTCDate()
    } else if (slot.isRecurring && slot.dayOfWeek !== null) {
      // Recurring slot: match day of week
      dateMatches = slot.dayOfWeek === bookingDayOfWeek
    }

    if (!dateMatches) continue

    // Check if the full session fits within the slot's time window
    const slotStart = timeToMinutes(slot.startTime)
    const slotEnd = timeToMinutes(slot.endTime)

    if (requestedStart >= slotStart && requestedEnd <= slotEnd) {
      return true
    }
  }

  return false
}
