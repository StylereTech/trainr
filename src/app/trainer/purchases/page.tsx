import { requireAuth } from '@/lib/route-guards'
import { PackagePurchaseHistory } from '@/components/shared/PackagePurchaseHistory'

export default async function TrainerPurchasesPage() {
  await requireAuth(['TRAINER'])
  return <PackagePurchaseHistory role="TRAINER" />
}
