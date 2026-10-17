import { z } from 'zod'

export function canonicalTimeZone(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 100) return null
  const name = value.trim()
  // Require a named zone; abbreviations and numeric offsets are ambiguous.
  if (name !== 'UTC' && !/^[A-Za-z_+-]+(?:\/[A-Za-z0-9_+-]+)+$/.test(name)) return null
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: name }).resolvedOptions().timeZone
  } catch {
    return null
  }
}

export const timeZoneSchema = z.unknown().transform((value, context) => {
  const zone = canonicalTimeZone(value)
  if (!zone) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'Choose a valid schedule time zone.' })
    return z.NEVER
  }
  return zone
})
