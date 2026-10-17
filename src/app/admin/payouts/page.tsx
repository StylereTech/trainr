"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { Loader2, DollarSign, TrendingUp, Clock, ArrowUpDown, Sparkles, WalletCards } from 'lucide-react'

interface Payment {
  id: string
  amountInCents: number
  platformFeeInCents: number
  trainerPayoutInCents: number
  processingFeeInCents: number
  status: string
  stripePaymentIntentId: string | null
  stripeTransferId: string | null
  refundAmountInCents: number
  createdAt: string
  booking: {
    trainerProfile: { firstName: string; lastName: string; stripeAccountId: string | null; stripeOnboardingComplete: boolean }
    parentProfile: { user: { email: string } }
    serviceOffering: { title: string }
  }
}

export default function AdminPayouts() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [summary, setSummary] = useState<{ grossCaptured: number; recordedRefunds: number; netCaptured: number; awaitingPayment: number } | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 20

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/payouts?view=payments&page=${page}&limit=${limit}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to load payments')
      if (!Array.isArray(data.payments) || !data.summary || !data.pagination ||
          !['grossCaptured', 'recordedRefunds', 'netCaptured', 'awaitingPayment'].every(key => Number.isFinite(data.summary[key]))) {
        throw new Error('Payment data is incomplete. Please try again.')
      }
      setPayments(data.payments)
      setSummary(data.summary)
      setTotal(data.pagination.total)
    } catch (error) {
      setPayments([])
      setSummary(null)
      setTotal(0)
      setError(error instanceof Error ? error.message : 'Unable to load payments')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchData() }, [page])

  const totalPages = Math.ceil(total / limit)

  const statusColors: Record<string, string> = {
    PENDING: 'bg-amber-500/15 text-amber-200',
    PROCESSING: 'bg-blue-500/15 text-blue-200',
    SUCCEEDED: 'bg-emerald-500/15 text-emerald-200',
    FAILED: 'bg-rose-500/15 text-rose-200',
    REFUNDED: 'bg-violet-500/15 text-violet-200',
    PARTIALLY_REFUNDED: 'bg-orange-500/15 text-orange-200',
  }

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_30%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Revenue + payouts</Badge>
        <h1 className="mt-4 text-2xl font-semibold">Recorded Payments</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">Booking payment records. Bank payout status is recorded separately by Stripe.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Gross captured', value: summary ? formatCurrency(summary.grossCaptured) : '--', icon: DollarSign },
            { label: 'Recorded refunds', value: summary ? formatCurrency(summary.recordedRefunds) : '--', icon: ArrowUpDown },
            { label: 'Net captured', value: summary ? formatCurrency(summary.netCaptured) : '--', icon: TrendingUp },
            { label: 'Awaiting payment', value: summary ? formatCurrency(summary.awaitingPayment) : '--', icon: Clock },
          ].map((item) => (
            <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300"><item.icon className="h-4 w-4 text-emerald-300" /> {item.label}</div>
              <div className="mt-2 text-3xl font-semibold text-white">{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      <Card className="border-white/10 bg-white/[0.04] text-white">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><WalletCards className="h-5 w-5 text-emerald-300" /> Payment history</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></div>
          ) : error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 py-6 text-rose-300">
              <p className="min-w-0 flex-1">{error}</p>
              <Button variant="outline" onClick={fetchData}>Retry</Button>
            </div>
          ) : payments.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/45 py-10 text-center text-slate-400">No payments yet</div>
          ) : (
            <div className="space-y-3">
              {payments.map((payment) => (
                <div key={payment.id} className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-sm text-white">{payment.booking.parentProfile.user.email.split('@')[0]}</span>
                        <span className="text-slate-500">→</span>
                        <span className="font-medium text-sm text-white">{payment.booking.trainerProfile.firstName} {payment.booking.trainerProfile.lastName}</span>
                        <Badge className={statusColors[payment.status] || ''}>{payment.status}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-slate-300">{payment.booking.serviceOffering.title}</div>
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                        <span>Created {new Date(payment.createdAt).toLocaleDateString()}</span>
                        <span className={payment.booking.trainerProfile.stripeOnboardingComplete ? 'text-emerald-300' : 'text-rose-300'}>
                          Stripe {payment.booking.trainerProfile.stripeOnboardingComplete ? 'connected' : 'incomplete'}
                        </span>
                        {payment.stripeTransferId && <span>Transfer {payment.stripeTransferId.slice(0, 12)}...</span>}
                      </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[320px]">
                      <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3 text-sm">
                        <div className="font-semibold text-white">{formatCurrency(payment.amountInCents)}</div>
                        <div className="mt-1 text-xs text-slate-400">Platform fee: {formatCurrency(payment.platformFeeInCents)}</div>
                        <div className="mt-1 text-xs text-slate-400">Processing: {formatCurrency(payment.processingFeeInCents)}</div>
                        <div className="mt-1 text-xs text-slate-400">Trainer share: {formatCurrency(payment.trainerPayoutInCents)}</div>
                        {payment.refundAmountInCents > 0 && <div className="mt-1 text-xs text-rose-300">Refunded: {formatCurrency(payment.refundAmountInCents)}</div>}
                      </div>
                      <div className="rounded-[1.25rem] border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
                        <div className="font-semibold text-white">Finance readiness</div>
                        <div className="mt-2">Trainer Stripe account: {payment.booking.trainerProfile.stripeAccountId ? 'Present' : 'Missing'}</div>
                        <div className="mt-1">Payment intent: {payment.stripePaymentIntentId ? 'Recorded' : 'Unavailable'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  )
}
