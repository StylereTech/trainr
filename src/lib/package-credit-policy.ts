export type CreditRestorationReason = 'TRAINER_CANCELLATION' | 'EARLY_PARENT_CANCELLATION'

export function creditRestorationReason(role: string, startsAt: Date | null, cancelledAt: Date): CreditRestorationReason | null {
  if (!Number.isFinite(cancelledAt.getTime())) return null
  if (role === 'TRAINER') return 'TRAINER_CANCELLATION'
  if (role === 'PARENT' && startsAt && Number.isFinite(startsAt.getTime()) && startsAt.getTime() - cancelledAt.getTime() >= 24 * 60 * 60 * 1000) {
    return 'EARLY_PARENT_CANCELLATION'
  }
  return null
}
