import { SPECIALTIES, slugify } from '@/lib/utils'

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
  availabilitySlots: { dayOfWeek: number | null; startTime: string; endTime: string }[],
  selectedDate: string,
  durationMinutes: number
): string[] {
  if (!selectedDate || durationMinutes <= 0) return []

  const dayOfWeek = parseDateInputAsLocalDate(selectedDate).getDay()
  const relevantSlots = availabilitySlots.filter((slot) => slot.dayOfWeek === dayOfWeek)
  const times: string[] = []

  for (const slot of relevantSlots) {
    const [startH, startM] = slot.startTime.split(':').map(Number)
    const [endH, endM] = slot.endTime.split(':').map(Number)
    let current = startH * 60 + startM
    const sessionLength = durationMinutes
    const end = endH * 60 + endM

    while (current + sessionLength <= end) {
      const h = Math.floor(current / 60)
      const m = current % 60
      times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      current += sessionLength
    }
  }

  return times
}
