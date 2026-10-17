import { afterEach, expect, it, vi } from 'vitest'
import { athleteProfileSchema } from '@/lib/validations'
import { createAthleteSchema, updateAthleteSchema } from '@/lib/athlete-profiles'

const data = { firstName: ' Synthetic ', lastName: ' Athlete ', dateOfBirth: '2016-02-29', sports: ['football'] }
afterEach(() => vi.useRealTimers())
it('normalizes bounded names and defaults without adding private fields', () => {
  expect(athleteProfileSchema.parse(data)).toMatchObject({ firstName: 'Synthetic', lastName: 'Athlete', goals: [], notes: '', skillLevel: 'BEGINNER' })
})
it.each(['2015-02-29', '2016-02-30', '2020-04-31', '0000-01-01', '2010-13-01', '2010-01-00', 'invalid', '01/02/2015', '2015-01-01T00:00:00Z', '9999-01-01'])('rejects malformed, rolled-over or future birth date %s', dateOfBirth => {
  expect(athleteProfileSchema.safeParse({ ...data, dateOfBirth }).success).toBe(false)
})
it('uses an explicit UTC calendar boundary for future birth dates', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-08T00:01:00Z'))
  expect(athleteProfileSchema.safeParse({ ...data, dateOfBirth: '2026-10-08' }).success).toBe(true)
  expect(athleteProfileSchema.safeParse({ ...data, dateOfBirth: '2026-10-09' }).success).toBe(false)
})
it.each([{ firstName: '  ' }, { lastName: 'x'.repeat(51) }, { sports: [] }, { sports: ['football', 'football'] }, { sports: [''] }, { sports: Array.from({ length: 21 }, (_, i) => `s${i}`) }, { notes: 'x'.repeat(2001) }, { goals: [''] }, { goals: ['x'.repeat(201)] }, { goals: Array(21).fill('goal') }, { gender: 'INVALID' }, { skillLevel: 'EXPERT' }])('rejects invalid profile fields %j', change => {
  expect(athleteProfileSchema.safeParse({ ...data, ...change }).success).toBe(false)
})
it('requires a stable creation key and rejects client ownership injection', () => {
  expect(createAthleteSchema.safeParse(data).success).toBe(false)
  expect(createAthleteSchema.safeParse({ ...data, requestId: '72d06c97-77f0-4a29-a4cf-8c55f0666a7f' }).success).toBe(true)
  expect(createAthleteSchema.safeParse({ ...data, requestId: '72d06c97-77f0-4a29-a4cf-8c55f0666a7f', parentProfileId: 'other' }).success).toBe(false)
  expect(updateAthleteSchema.safeParse({ ...data, revision: 'not-a-revision' }).success).toBe(false)
})
