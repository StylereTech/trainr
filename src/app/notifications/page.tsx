import { requireAuth } from '@/lib/route-guards'
import { NotificationInbox } from '@/components/notifications/NotificationInbox'

export default async function NotificationsPage() {
  const session = await requireAuth(['PARENT', 'TRAINER', 'ADMIN'])
  return <NotificationInbox role={session.user.role} />
}
