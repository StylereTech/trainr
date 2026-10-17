import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/auth'
import { notificationActionSchema, notificationQuerySchema } from '@/lib/notification-contract'
import { changeNotifications, NotificationError, readNotifications } from '@/lib/notifications'

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
export async function GET(req: NextRequest) {
  try {
    const actor = await getRequestUser(req)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    const input = notificationQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
    if (!input.success) return json({ error: 'Invalid notification filters' }, 400)
    return json(await readNotifications(actor, input.data))
  } catch (error) {
    if (error instanceof NotificationError) return json({ error: error.message }, error.status)
    console.error('Notification inbox query failed')
    return json({ error: 'Unable to load notifications. Please retry.' }, 503)
  }
}
export async function PATCH(req: NextRequest) {
  try {
    const actor = await getRequestUser(req)
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    const input = notificationActionSchema.safeParse(await req.json().catch(() => null))
    if (!input.success) return json({ error: 'Invalid notification action' }, 400)
    return json(await changeNotifications(actor, input.data))
  } catch (error) {
    if (error instanceof NotificationError) return json({ error: error.message }, error.status)
    console.error('Notification inbox update failed')
    return json({ error: 'Unable to confirm this change. Reload the inbox.' }, 503)
  }
}
