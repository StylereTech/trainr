import { requireAuth } from '@/lib/route-guards'

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  await requireAuth(['PARENT'])
  return children
}
