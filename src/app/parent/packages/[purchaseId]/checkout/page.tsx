import { requireAuth } from '@/lib/route-guards'
import { PackageCheckout } from '@/components/shared/PackageCheckout'

export default async function ReviewPurchasePage({ params }: { params: Promise<{ purchaseId: string }> }) {
  const session = await requireAuth(['PARENT']), { purchaseId } = await params
  return <PackageCheckout buyerId={session.user.id} purchaseId={purchaseId} />
}
