import { describe, expect, it } from 'vitest'
import { canonicalTimeZone, timeZoneSchema } from '@/lib/time-zone'

describe('explicit schedule time zone', () => {
  it.each(['America/Chicago', 'America/Phoenix', 'Pacific/Honolulu', 'Asia/Kathmandu', 'Australia/Lord_Howe', 'UTC'])('accepts %s', zone => {
    expect(timeZoneSchema.parse(zone)).toBe(canonicalTimeZone(zone))
    expect(canonicalTimeZone(zone)).toBeTruthy()
  })
  it.each([['US/Eastern', 'America/New_York'], ['Etc/UTC', 'UTC'], [' America/Chicago ', 'America/Chicago']])('canonicalizes %s', (input, output) => {
    expect(timeZoneSchema.parse(input)).toBe(output)
  })
  it.each([undefined, null, '', ' ', 'CST', 'EST', 'GMT', '-06:00', '+01', 'UTC+6', 'America/Imaginary', 'America/Chicago\u0000', '../Chicago', {}, 0, 'a'.repeat(101)])('rejects %j without guessing', value => {
    expect(canonicalTimeZone(value)).toBeNull()
    expect(timeZoneSchema.safeParse(value).success).toBe(false)
  })
})
