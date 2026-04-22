import { requireAuth } from '@/lib/route-guards'

export default async function TrainerProfileLayout({ children }: { children: React.ReactNode }) {
  await requireAuth(['TRAINER'])
  return children
}
