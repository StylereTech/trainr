import { z } from 'zod'

const id = z.string().min(1).max(128)
export const packagePurchaseRequestSchema = z.object({
  requestId: z.string().uuid(), packageId: id, catalogRevision: z.string().datetime(),
  expectedTotalInCents: z.number().int().min(50).max(99999999),
}).strict()

export const approvedPackageCreditPolicy = Object.freeze({
  ownership: 'PARENT_CHILDREN',
  validityStartsOn: 'PAYMENT_SUCCEEDED',
  parentCancellationRestoreHours: 24,
  restoreOnTrainerCancellation: true,
  consumeOnLateParentCancellation: true,
  consumeOnNoShow: true,
  cashRefunds: 'SEPARATE_POLICY',
} as const)

const packageCreditPolicySchema = z.object({
  ownership: z.literal(approvedPackageCreditPolicy.ownership),
  validityStartsOn: z.literal(approvedPackageCreditPolicy.validityStartsOn),
  parentCancellationRestoreHours: z.literal(approvedPackageCreditPolicy.parentCancellationRestoreHours),
  restoreOnTrainerCancellation: z.literal(true),
  consumeOnLateParentCancellation: z.literal(true),
  consumeOnNoShow: z.literal(true),
  cashRefunds: z.literal(approvedPackageCreditPolicy.cashRefunds),
}).strict()

const termsShape = {
  title: z.string().trim().min(1).max(150), description: z.string().max(2000),
  validForDays: z.number().int().min(1).max(3650), totalSessions: z.number().int().min(1).max(1000),
  items: z.array(z.object({
    serviceOfferingId: id, title: z.string().min(1).max(150), sportId: id,
    durationMinutes: z.number().int().positive().max(1440),
    type: z.enum(['INDIVIDUAL', 'GROUP', 'VIRTUAL']), sessionsCount: z.number().int().min(1).max(1000),
  }).strict()).min(1).max(50),
}

// Legacy records stay readable without silently acquiring newly approved terms.
export const packagePurchaseTermsSchema = z.discriminatedUnion('version', [
  z.object({ version: z.literal(1), ...termsShape }).strict(),
  z.object({ version: z.literal(2), ...termsShape, creditPolicy: packageCreditPolicySchema }).strict(),
]).superRefine((terms, ctx) => {
  if (new Set(terms.items.map(item => item.serviceOfferingId)).size !== terms.items.length) {
    ctx.addIssue({ code: 'custom', message: 'Each service must occur once' })
  }
  if (terms.items.reduce((sum, item) => sum + item.sessionsCount, 0) !== terms.totalSessions) {
    ctx.addIssue({ code: 'custom', message: 'Package session quantities do not match' })
  }
})
export type PackagePurchaseTerms = z.infer<typeof packagePurchaseTermsSchema>
