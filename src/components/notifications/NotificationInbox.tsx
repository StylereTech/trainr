'use client'

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Bell, CheckCheck, Mail, MailOpen, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notificationListSchema, type NotificationList } from '@/lib/notification-contract'

const dollars = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const timestamp = (value: string) => new Date(value).toUTCString()
type View = 'all' | 'unread'
const outlineButton = 'border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900'

export function NotificationInbox({ role }: { role: string }) {
  const [data, setData] = useState<NotificationList | null>(null)
  const [view, setView] = useState<View>('all')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const controller = useRef<AbortController | null>(null)
  const bookingsHref = role === 'ADMIN' ? '/admin/bookings' : role === 'TRAINER' ? '/trainer/dashboard' : '/parent/dashboard'

  const load = useCallback(async (page: number, nextView: View) => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    const revision = ++generation.current
    const timer = setTimeout(() => request.abort(), 15000)
    setLoading(true); setError(''); setData(null); setView(nextView)
    try {
      const response = await fetch(`/api/notifications?page=${page}&view=${nextView}`, { cache: 'no-store', signal: request.signal })
      if (!response.ok) throw new Error('read')
      const parsed = notificationListSchema.parse(await response.json())
      if (revision === generation.current) { setData(parsed); setUncertain(false) }
    } catch {
      if (revision === generation.current) setError('Unable to load notifications. Please retry.')
    } finally {
      clearTimeout(timer)
      if (revision === generation.current) setLoading(false)
    }
  }, [])
  const cancelLoad = useCallback(() => { generation.current++; controller.current?.abort() }, [])
  useEffect(() => {
    void load(1, 'all')
    return cancelLoad
  }, [load, cancelLoad])

  async function change(ids: string[], read: boolean) {
    if (busy || loading || uncertain || !data) return
    setBusy(true); setError('')
    const revision = generation.current
    const request = new AbortController()
    const timer = setTimeout(() => request.abort(), 15000)
    try {
      const response = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, read }), signal: request.signal })
      if (!response.ok || (await response.json()).success !== true) throw new Error('write')
      if (revision === generation.current) await load(data.pagination.page, view)
    } catch {
      if (revision === generation.current) {
        setUncertain(true)
        setError('Unable to confirm this change. Reload the inbox before making another change.')
      }
    } finally { clearTimeout(timer); setBusy(false) }
  }

  const disabled = loading || busy
  const unreadIds = data?.notifications.filter(item => !item.readAt).map(item => item.id) ?? []
  return <section className="min-h-[70vh] bg-white px-4 py-8 text-zinc-900 sm:px-6">
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div><h1 className="flex items-center gap-2 text-2xl font-semibold"><Bell className="h-6 w-6" />Notifications</h1>
          {data && <p className="mt-1 text-sm text-zinc-600" role="status">{data.unreadCount} unread</p>}</div>
        <Link className="text-sm font-medium text-emerald-800 underline underline-offset-4" href={bookingsHref}>Bookings</Link>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 py-4">
        <div role="group" aria-label="Notification filter" className="flex gap-1">
          {(['all', 'unread'] as const).map(item => <Button key={item} variant={view === item ? 'default' : 'outline'} disabled={disabled}
            className={view === item ? 'bg-emerald-700 text-white hover:bg-emerald-800' : outlineButton}
            aria-pressed={view === item} onClick={() => void load(1, item)}>{item === 'all' ? 'All' : 'Unread'}</Button>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" className={outlineButton} disabled={disabled || uncertain || !unreadIds.length} onClick={() => void change(unreadIds, true)}>
            <CheckCheck className="mr-2 h-4 w-4" />Mark page read</Button>
          <Button size="icon" variant="outline" className={outlineButton} title="Refresh notifications" aria-label="Refresh notifications" disabled={disabled}
            onClick={() => void load(data?.pagination.page ?? 1, view)}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>
      {error && <div role="alert" className="my-4 border-l-4 border-rose-600 bg-rose-50 p-4 text-sm text-rose-900">
        <p>{error}</p><Button className={`mt-3 ${outlineButton}`} variant="outline" disabled={disabled} onClick={() => void load(data?.pagination.page ?? 1, view)}>Reload inbox</Button>
      </div>}
      {loading && <p role="status" className="py-12 text-center text-zinc-600">Loading notifications...</p>}
      {!loading && data && !data.notifications.length && <p className="py-12 text-center text-zinc-600">{view === 'unread' ? 'No unread notifications.' : 'No notifications yet.'}</p>}
      <ul className="divide-y divide-zinc-200" aria-label="Notifications">
        {data?.notifications.map(item => <li key={item.id} className="py-5" data-testid="notification-row">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className={item.readAt ? 'text-zinc-500' : 'font-semibold text-emerald-800'}>{item.readAt ? 'Read' : 'Unread'}</span>
                {item.type === 'PAYMENT_REVIEW_REQUIRED' && <span className="font-semibold text-amber-800">Payment review</span>}
                <time dateTime={item.createdAt} className="text-zinc-500">{timestamp(item.createdAt)}</time>
              </div>
              <h2 className="break-words text-base font-semibold">{item.title}</h2>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-700">{item.message}</p>
            </div>
            <Button size="icon" variant="outline" className={`h-10 w-10 shrink-0 ${outlineButton}`} disabled={disabled || uncertain}
              aria-label={item.readAt ? 'Mark unread' : 'Mark read'} title={item.readAt ? 'Mark unread' : 'Mark read'}
              onClick={() => void change([item.id], !item.readAt)}>{item.readAt ? <Mail className="h-4 w-4" /> : <MailOpen className="h-4 w-4" />}</Button>
          </div>
          {item.reviewUnavailable && <p className="mt-3 text-sm text-rose-800">Payment details unavailable. Contact support.</p>}
          {item.financialReview && <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-medium text-amber-900">Recorded payment details</summary>
            <div className="mt-3 border-l-2 border-amber-300 pl-4">
              <dl className="grid gap-2 sm:grid-cols-2">
                {Object.entries({ Booking: item.bookingId, Charge: item.financialReview.chargeId, Transfer: item.financialReview.transferId,
                  'Application fee': item.financialReview.feeId, Destination: item.financialReview.destination }).map(([label, value]) =>
                  <div key={label} className="min-w-0"><dt className="text-zinc-500">{label}</dt><dd className="break-all font-mono text-xs">{value ?? 'None recorded'}</dd></div>)}
              </dl>
              <div className="my-3 flex flex-wrap gap-x-5 gap-y-1">
                <span>Customer refunded: {dollars(item.financialReview.refundedInCents)}</span>
                <span>Transfer reversed: {dollars(item.financialReview.transferReversedInCents)}</span>
                <span>Fee refunded: {dollars(item.financialReview.feeRefundedInCents)}</span>
              </div>
              {item.financialReview.disputes.map(dispute => <div key={dispute.id} className="mt-3 border-t border-zinc-200 pt-3">
                <p className="break-all font-mono text-xs">{dispute.id}</p>
                <p className="mt-1 break-words">{dispute.status.replaceAll('_', ' ')}: {dollars(dispute.amountInCents)}</p>
                <p>Evidence deadline: {dispute.dueBy === null ? 'Not recorded' : timestamp(new Date(dispute.dueBy * 1000).toISOString())}</p>
                {dispute.balanceTransactions.map(transaction => <p key={transaction.id} className="mt-2 break-all text-xs text-zinc-600">
                  {transaction.id}: amount {dollars(transaction.amountInCents)}, fee {dollars(transaction.feeInCents)}, net {dollars(transaction.netInCents)}
                </p>)}
              </div>)}
            </div>
          </details>}
        </li>)}
      </ul>
      {data && data.pagination.totalPages > 0 && <nav aria-label="Notification pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 py-5">
        <p className="text-sm text-zinc-600">Page {data.pagination.page} of {data.pagination.totalPages} ({data.pagination.total} notifications)</p>
        <div className="flex gap-2">
          <Button size="icon" variant="outline" className={outlineButton} aria-label="Previous notification page" title="Previous notification page" disabled={disabled || data.pagination.page <= 1}
            onClick={() => void load(data.pagination.page - 1, view)}><ArrowLeft className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" className={outlineButton} aria-label="Next notification page" title="Next notification page" disabled={disabled || data.pagination.page >= data.pagination.totalPages}
            onClick={() => void load(data.pagination.page + 1, view)}><ArrowRight className="h-4 w-4" /></Button>
        </div>
      </nav>}
    </div>
  </section>
}
