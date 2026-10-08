import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

export const feeValuesSchema = z.object({
  platformCommissionPercent: z.number().finite().min(0).max(50),
  stripeFeePercent: z.number().finite().min(0).max(10),
  processingFeeCents: z.number().int().min(0).max(99999999),
  minBookingAmountCents: z.number().int().min(1500).max(10000000),
})
export const feeUpdateSchema = feeValuesSchema.extend({ expectedConfigId: z.string().min(1).max(128).nullable() }).strict()
export const defaultFeeValues = { platformCommissionPercent: 15, stripeFeePercent: 2.9, processingFeeCents: 30, minBookingAmountCents: 1500 }
export class FeeConfigurationError extends Error {}
export class FeeEditConflict extends Error {}

type FeeReader = Pick<Prisma.TransactionClient, 'feeConfig'>

export async function effectiveFeeValues(db: FeeReader) {
  const active = await db.feeConfig.findMany({ where: { isActive: true, effectiveDate: { lte: new Date() } }, take: 2 })
  if (active.length > 1) throw new FeeConfigurationError('Fee configuration requires administrator review.')
  const parsed = feeValuesSchema.safeParse(active[0] || defaultFeeValues)
  if (!parsed.success) throw new FeeConfigurationError('Fee configuration requires administrator review.')
  return parsed.data
}

export async function updateFeeConfiguration(adminUserId: string, input: z.infer<typeof feeUpdateSchema>) {
  const { expectedConfigId, ...values } = feeUpdateSchema.parse(input)
  return prisma.$transaction(async (tx) => {
    // Serialize configuration writers even before the first configuration exists.
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(746726, 1)`
    const current = await tx.feeConfig.findMany({ where: { isActive: true }, orderBy: [{ effectiveDate: 'desc' }, { id: 'desc' }] })
    if ((current[0]?.id || null) !== expectedConfigId) throw new FeeEditConflict('Fee settings changed. Reload before saving.')
    await tx.feeConfig.updateMany({ where: { isActive: true }, data: { isActive: false } })
    const config = await tx.feeConfig.create({ data: { ...values, isActive: true, effectiveDate: new Date() } })
    await tx.adminAction.create({ data: {
      adminUserId, actionType: 'UPDATE_SETTINGS', targetType: 'FEE_CONFIG', targetId: config.id,
      description: 'Updated fee configuration for new bookings', metadata: { ...values, previousConfigIds: current.map((row) => row.id) },
    } })
    return config
  })
}
