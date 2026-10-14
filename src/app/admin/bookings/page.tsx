"use client"

import { useState, useEffect, useCallback } from 'react'
import { checkoutClosureMessage } from '@/lib/checkout-closure-message'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, BOOKING_STATUS_COLORS } from '@/lib/utils'
import { formatBookingDate } from '@/lib/booking-date'
import { Loader2, Calendar, RefreshCw } from 'lucide-react'
import { RefundSummary, type RefundSummaryPayment } from '@/components/shared/RefundSummary'
import { BookingOutcomeActions } from '@/components/shared/BookingOutcomeActions'
import { PaymentHoldSummary } from '@/components/shared/PaymentHoldSummary'
import { bookingPaymentHold, type BookingPaymentState, type PackageCreditFunding } from '@/lib/booking-payment-hold'

interface Booking {
  id: string
  date: string
  startTime: string
  timeZone: string | null
  startsAt: string | null
  endsAt: string | null
  endTime: string
  status: string
  totalAmountInCents: number
  platformFeeInCents: number
  trainerPayoutInCents: number
  notes: string | null
  createdAt: string
  trainerProfile: { firstName: string; lastName: string; slug: string }
  parentProfile: { user: { email: string } }
  athleteProfile: { firstName: string; lastName: string }
  serviceOffering: { title: string; priceInCents: number }
  payment: (RefundSummaryPayment & BookingPaymentState & { stripePaymentIntentId: string | null }) | null
  creditFunding?: PackageCreditFunding | null
}

export default function AdminBookings() {
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [refundError, setRefundError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const [refreshingRefundId, setRefreshingRefundId] = useState<string | null>(null)
  const limit = 20

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (statusFilter !== 'all') params.set('status', statusFilter)

    try {
      const res = await fetch(`/api/admin/bookings?${params}`)
      if (!res.ok) throw new Error('Unable to load bookings')
      const data = await res.json()
      if (!Array.isArray(data.bookings) || !Number.isInteger(data.pagination?.total)) throw new Error('Invalid booking response')
      setBookings(data.bookings)
      setTotal(data.pagination.total)
      return true
    } catch { setLoadError('Unable to load current bookings. Retry before relying on displayed payment state.'); return false }
    finally { setLoading(false) }
  }, [page, statusFilter])

  useEffect(() => { void fetchBookings() }, [fetchBookings])

  const refreshRefunds = async (bookingId: string) => {
    setRefreshingRefundId(bookingId)
    setRefundError('')
    try {
      const response = await fetch('/api/admin/refunds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bookingId, action: 'reconcile' }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Refund status could not be verified.')
      if (await fetchBookings()) toast({ title: 'Refund status verified', description: 'No refund or transfer was issued by this refresh.' })
    } catch (error) { setRefundError(error instanceof Error ? error.message : 'Refund status could not be verified. Retry reconciliation.') }
    finally { setRefreshingRefundId(null) }
  }

  const handleAction = async (bookingId: string, action: string) => {
    if (actionBusy || needsReload) return
    setActionBusy(true)
    setNeedsReload(true)
    setActionError('')
    try {
      const res = await fetch('/api/admin/bookings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, action }), signal: AbortSignal.timeout(15000),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking action could not be verified.')
      if (!await fetchBookings()) throw new Error('Current booking state could not be loaded. Reload before another action.')
      setNeedsReload(false)
      toast({ title: 'Booking updated', ...(action === 'cancel' ? { description: checkoutClosureMessage(data.checkoutClosure) } : {}) })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Booking action could not be verified. Reload before another action.')
    } finally { setActionBusy(false) }
  }

  const refreshPayment = async (bookingId: string) => {
    if (actionBusy || needsReload || refreshingRefundId) return
    setActionBusy(true)
    setNeedsReload(true)
    setActionError('')
    try {
      const response = await fetch('/api/admin/payments/reconcile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }), signal: AbortSignal.timeout(80000) })
      const result = await response.json()
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Payment refresh could not be verified.')
      if (result.reconciled !== true) throw new Error('Payment refresh returned an invalid response. Reload before retrying.')
      if (!await fetchBookings()) throw new Error('Current booking state could not be loaded. Reload before another action.')
      setNeedsReload(false)
      toast({ title: 'Payment records refreshed', description: 'No charge, refund, transfer or payout was issued.' })
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Payment refresh could not be verified. Reload before retrying.')
    } finally { setActionBusy(false) }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 text-white">
      <div className="border-b border-white/10 pb-5">
        <h1 className="text-2xl font-semibold">Bookings</h1>
      </div>

      <Card className="border-white/10 bg-white/[0.04] text-white">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-12 w-full border-white/10 bg-slate-950/60 text-white sm:w-48"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
                <SelectItem value="NO_SHOW">No Show</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-slate-400">{total} booking{total !== 1 ? 's' : ''}</div>
          </div>
        </CardContent>
      </Card>

      {refundError && <p role="alert" className="border-l-2 border-rose-400 p-3 text-sm text-rose-200">{refundError}</p>}
      {actionError && <div role="alert" className="border-l-2 border-rose-400 p-3 text-sm text-rose-200">{actionError}<Button variant="outline" disabled={actionBusy} onClick={async () => { if (await fetchBookings()) { setNeedsReload(false); setActionError('') } }}><RefreshCw className="mr-2 h-4 w-4" />Reload booking state</Button></div>}
      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></div>
      ) : loadError ? (
        <div role="alert" className="text-sm text-rose-200">{loadError}<Button variant="outline" size="sm" className="ml-2" onClick={() => void fetchBookings()}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></div>
      ) : bookings.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="py-10 text-center text-slate-400">No bookings found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Card key={b.id} className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-4">
                <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem] xl:items-start">
                  <div className="min-w-0 break-words">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm text-white">{b.parentProfile.user.email.split('@')[0]}</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-medium text-sm text-white">{b.trainerProfile.firstName} {b.trainerProfile.lastName}</span>
                      <Badge className={BOOKING_STATUS_COLORS[b.status] || ''}>{b.status}</Badge>
                      {b.payment && <Badge variant="outline" className={b.payment.status === 'SUCCEEDED' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/20 bg-amber-400/10 text-amber-200'}>Payment: {b.payment.status}</Badge>}
                      {b.creditFunding && <Badge variant="outline">Package credit</Badge>}
                    </div>
                    <RefundSummary payment={b.payment} />
                    <PaymentHoldSummary booking={b} />
                    <div className="mt-2 text-sm text-slate-300">{b.serviceOffering.title} • {b.athleteProfile.firstName} {b.athleteProfile.lastName}</div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{formatBookingDate(b.date)}</span>
                      <span>{b.startTime} – {b.endTime} ({b.timeZone || 'Time zone unconfirmed'})</span>
                      <span>Booked {new Date(b.createdAt).toLocaleDateString()}</span>
                    </div>
                    {b.notes && <div className="mt-2 text-xs italic text-slate-400">&ldquo;{b.notes}&rdquo;</div>}
                  </div>
                  <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/45 p-3 text-sm">
                      <div className="font-semibold text-white">{b.creditFunding ? '1 session credit' : formatCurrency(b.totalAmountInCents)}</div>
                      <div className="mt-1 text-xs text-slate-400">{b.creditFunding ? 'Allocation recorded on package purchase' : `Booked fee: ${formatCurrency(b.platformFeeInCents)} • Trainer allocation: ${formatCurrency(b.trainerPayoutInCents)}`}</div>
                      {(b.payment?.refundAmountInCents || b.payment?.refundPendingAmountInCents || b.payment?.refundFailedCount || ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(b.payment?.status || '')) ? <div className="mt-1 text-xs text-amber-200">Net payout needs reconciliation</div> : null}
                    </div>
                    <div className="flex min-w-0 flex-wrap gap-2">
                      {b.payment && b.totalAmountInCents > 0 && <Button size="sm" variant="outline" disabled={actionBusy || needsReload || !!refreshingRefundId} onClick={() => void refreshPayment(b.id)}><RefreshCw className="mr-2 h-4 w-4" />Refresh payment</Button>}
                      {b.status === 'CANCELLED' && !b.creditFunding && <Button size="sm" variant="outline" disabled={actionBusy || needsReload} onClick={() => void handleAction(b.id, 'cancel')}><RefreshCw className="mr-2 h-4 w-4" />Reconcile checkout</Button>}
                      {b.payment?.stripePaymentIntentId && <Button size="sm" variant="outline" disabled={!!refreshingRefundId || actionBusy || needsReload} onClick={() => void refreshRefunds(b.id)}>
                        {refreshingRefundId === b.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh refunds
                      </Button>}
                      {b.status === 'PENDING' && (
                        <>
                          <Button size="sm" disabled={actionBusy || needsReload || !!bookingPaymentHold(b)} className="gradient-primary border-0 text-white" onClick={() => handleAction(b.id, 'confirm')}>Confirm</Button>
                          <Button size="sm" disabled={actionBusy || needsReload || !!b.creditFunding} title={b.creditFunding ? 'Credit cancellation requires the owning parent or trainer.' : undefined} variant="outline" className="border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => handleAction(b.id, 'cancel')}>Cancel</Button>
                        </>
                      )}
                      {b.status === 'CONFIRMED' && (
                        <>
                          <BookingOutcomeActions booking={b} disabled={actionBusy || needsReload || !!bookingPaymentHold(b)} onAction={action => void handleAction(b.id, action)} />
                          <Button size="sm" disabled={actionBusy || needsReload || !!b.creditFunding} title={b.creditFunding ? 'Credit cancellation requires the owning parent or trainer.' : undefined} variant="outline" className="border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => handleAction(b.id, 'cancel')}>Cancel</Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
