import { requireAuth } from '@/lib/route-guards'

export default async function TrainerOnboardingLayout({ children }: { children: React.ReactNode }) {
  await requireAuth(['TRAINER'])
  return children
}
