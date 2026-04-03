"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency, BOOKING_STATUS_COLORS } from '@/lib/utils'
import { Loader2, Calendar, Sparkles } from 'lucide-react'

interface Booking {
  id: string
  date: string
  startTime: string
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
  payment: { status: string; stripePaymentIntentId: string | null } | null
}

export default function AdminBookings() {
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const fetchBookings = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (statusFilter !== 'all') params.set('status', statusFilter)

    const res = await fetch(`/api/admin/bookings?${params}`)
    if (res.ok) {
      const data = await res.json()
      setBookings(data.bookings || [])
      setTotal(data.pagination.total)
    }
    setLoading(false)
  }

  useEffect(() => { fetchBookings() }, [page, statusFilter])

  const handleAction = async (bookingId: string, action: string) => {
    const res = await fetch('/api/admin/bookings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, action }),
    })
    if (res.ok) {
      toast({ title: `Booking ${action}ed` })
      fetchBookings()
    } else {
      const data = await res.json()
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 md:p-7">
        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Booking operations</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Manage platform bookings in a cleaner, mobile-safe command view.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">Rows now stack with stronger hierarchy, fee math stays readable on small screens, and actions no longer feel visually detached from the premium Trainr system.</p>
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

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></div>
      ) : bookings.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="py-10 text-center text-slate-400">No bookings found</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {bookings.map((b) => (
            <Card key={b.id} className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm text-white">{b.parentProfile.user.email.split('@')[0]}</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-medium text-sm text-white">{b.trainerProfile.firstName} {b.trainerProfile.lastName}</span>
                      <Badge className={BOOKING_STATUS_COLORS[b.status] || ''}>{b.status}</Badge>
                      {b.payment && <Badge variant="outline" className={b.payment.status === 'SUCCEEDED' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border-amber-400/20 bg-amber-400/10 text-amber-200'}>Payment: {b.payment.status}</Badge>}
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{b.serviceOffering.title} • {b.athleteProfile.firstName} {b.athleteProfile.lastName}</div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(b.date).toLocaleDateString()}</span>
                      <span>{b.startTime} – {b.endTime}</span>
                      <span>Booked {new Date(b.createdAt).toLocaleDateString()}</span>
                    </div>
                    {b.notes && <div className="mt-2 text-xs italic text-slate-400">&ldquo;{b.notes}&rdquo;</div>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[300px]">
                    <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/45 p-3 text-sm">
                      <div className="font-semibold text-white">{formatCurrency(b.totalAmountInCents)}</div>
                      <div className="mt-1 text-xs text-slate-400">Fee: {formatCurrency(b.platformFeeInCents)} • Payout: {formatCurrency(b.trainerPayoutInCents)}</div>
                    </div>
                    <div className="flex flex-wrap gap-2 xl:justify-end">
                      {b.status === 'PENDING' && (
                        <>
                          <Button size="sm" className="gradient-primary border-0 text-white" onClick={() => handleAction(b.id, 'confirm')}>Confirm</Button>
                          <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => handleAction(b.id, 'cancel')}>Cancel</Button>
                        </>
                      )}
                      {b.status === 'CONFIRMED' && (
                        <>
                          <Button size="sm" className="gradient-primary border-0 text-white" onClick={() => handleAction(b.id, 'complete')}>Complete</Button>
                          <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => handleAction(b.id, 'cancel')}>Cancel</Button>
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
