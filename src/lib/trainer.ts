import { SPECIALTIES, slugify } from '@/lib/utils'
import { isTimeSlotAvailable, minutesToTime, timeToMinutes } from '@/lib/availability'

export function slugifySpecialty(value: string): string {
  return slugify(value)
}

export function normalizeSpecialtySelections(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value.trim())
        .filter(Boolean)
        .map(slugifySpecialty)
    )
  )
}

export function getSpecialtyOptionsForSports(selectedSports: string[]) {
  return selectedSports.flatMap((sport) =>
    (SPECIALTIES[sport] || []).map((name) => ({
      sport,
      name,
      slug: slugifySpecialty(name),
    }))
  )
}

export function parseDateInputAsLocalDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function generateAvailableTimeSlots(
  availabilitySlots: { dayOfWeek: number | null; startTime: string; endTime: string; specificDate?: string | Date | null; isRecurring?: boolean; isAvailable?: boolean }[],
  selectedDate: string,
  durationMinutes: number
): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDate) || !Number.isInteger(durationMinutes) || durationMinutes <= 0) return []
  const date = new Date(`${selectedDate}T00:00:00.000Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== selectedDate) return []
  const slots = availabilitySlots.map((slot) => ({
    ...slot,
    specificDate: slot.specificDate ? new Date(slot.specificDate) : null,
    isRecurring: slot.isRecurring ?? !slot.specificDate,
    isAvailable: slot.isAvailable ?? true,
  }))
  const times = new Set<string>()
  for (const slot of slots) {
    if (!slot.isAvailable) continue
    const end = timeToMinutes(slot.endTime)
    for (let current = timeToMinutes(slot.startTime); current + durationMinutes <= end; current += durationMinutes) {
      const time = minutesToTime(current)
      if (isTimeSlotAvailable([slot], date, time, durationMinutes) && isTimeSlotAvailable(slots, date, time, durationMinutes)) times.add(time)
    }
  }
  return Array.from(times).sort()
}
