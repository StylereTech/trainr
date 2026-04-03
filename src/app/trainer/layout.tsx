import { requireAuth } from '@/lib/route-guards'

export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  await requireAuth(['TRAINER'])
  return children
}
