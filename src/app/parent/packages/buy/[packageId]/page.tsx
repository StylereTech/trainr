import { requireAuth } from '@/lib/route-guards'
import { PackageCheckout } from '@/components/shared/PackageCheckout'

export default async function BuyPackagePage({ params }: { params: Promise<{ packageId: string }> }) {
  const session = await requireAuth(['PARENT']), { packageId } = await params
  return <PackageCheckout buyerId={session.user.id} packageId={packageId} />
}
