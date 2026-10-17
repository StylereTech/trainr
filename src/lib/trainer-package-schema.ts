import { z } from 'zod'

const id = z.string().min(1).max(128)
const items = z.array(z.object({ serviceOfferingId: id, sessionsCount: z.number().int().min(1).max(1000) }).strict()).min(1).max(50)
  .refine(value => new Set(value.map(item => item.serviceOfferingId)).size === value.length, 'Choose each service only once')
  .refine(value => value.reduce((sum, item) => sum + item.sessionsCount, 0) <= 1000, 'A package can contain at most 1000 sessions')
export const packageSaveSchema = z.object({
  action: z.literal('save'), id, revision: z.string().datetime().nullable(),
  title: z.string().trim().min(1).max(150), description: z.string().trim().max(2000),
  priceInCents: z.number().int().min(50).max(99999999), validForDays: z.number().int().min(1).max(3650), items,
}).strict()
export const packageCommandSchema = z.discriminatedUnion('action', [packageSaveSchema,
  z.object({ action: z.literal('setActive'), id, revision: z.string().datetime(), isActive: z.boolean() }).strict(),
])
export const packageRecordSchema = z.object({
  id, revision: z.string().datetime(), title: z.string(), description: z.string(), totalSessions: z.number().int().nonnegative(),
  priceInCents: z.number().int().nonnegative(), validForDays: z.number().int().positive(), isActive: z.boolean(), termsLocked: z.boolean(),
  items: z.array(z.object({ serviceOfferingId: id, title: z.string(), sessionsCount: z.number().int().positive(), available: z.boolean() })),
})
export const packageListSchema = z.object({ packages: z.array(packageRecordSchema),
  services: z.array(z.object({ id, title: z.string(), durationMinutes: z.number().int().positive() })),
  page: z.number().int().positive(), total: z.number().int().nonnegative(), totalPages: z.number().int().positive(),
})
export type PackageRecord = z.infer<typeof packageRecordSchema>
export type PackageSave = z.infer<typeof packageSaveSchema>
