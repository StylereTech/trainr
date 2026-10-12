'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RefundSummary } from '@/components/shared/RefundSummary'
import { useRemoteData } from '@/lib/use-remote-data'
import { formatCurrency } from '@/lib/utils'
import { packageHistoryResponse, packagePaymentLabel, packageRefreshResponse, type PackageHistoryQuery } from '@/lib/package-history-schema'

export function PackagePurchaseHistory({ role }: { role: 'PARENT' | 'TRAINER' }) {
  const [view, setView] = useState<PackageHistoryQuery['view']>('all')
  const [page, setPage] = useState(1)
  const history = useRemoteData(`/api/package-purchases?view=${view}&page=${page}&limit=10`, packageHistoryResponse)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const inFlight = useRef(false)
  const reload = async () => {
    setNotice('')
    if (await history.reload()) { setUncertain(false); setError('') }
  }
  const refreshPayment = async (purchaseId: string) => {
    if (inFlight.current || uncertain || history.loading) return
    inFlight.current = true; setBusyId(purchaseId); setError(''); setNotice('')
    try {
      const response = await fetch('/api/package-purchases/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId }), signal: AbortSignal.timeout(15000), redirect: 'error' })
      const data: unknown = await response.json()
      if (!response.ok) {
        const parsed = z.object({ error: z.string().min(1).max(500) }).safeParse(data)
        throw new Error(parsed.success ? parsed.data.error : 'Payment refresh could not be verified.')
      }
      const result = packageRefreshResponse.parse(data)
      if (result.purchaseId !== purchaseId) throw new Error('Payment refresh identity did not match.')
      if (!await history.reload()) throw new Error('Payment refresh finished, but current history could not be loaded.')
      setNotice('Payment records refreshed')
    } catch (error) {
      setUncertain(true)
      setError(error instanceof Error && !(error instanceof z.ZodError) ? error.message : 'Payment refresh could not be verified.')
    } finally { inFlight.current = false; setBusyId(null) }
  }
  const disabled = Boolean(busyId) || history.loading
  const pagination = history.data?.pagination
  return <main className="container max-w-5xl py-6 md:py-8">
    <Link href={role === 'PARENT' ? '/parent/dashboard' : '/trainer/packages'} className="mb-4 inline-flex items-center gap-2 text-sm text-slate-300">
      <ArrowLeft className="h-4 w-4" />{role === 'PARENT' ? 'Dashboard' : 'Packages'}
    </Link>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
      <h1 className="text-2xl font-semibold">{role === 'PARENT' ? 'My package purchases' : 'Package purchases'}</h1>
      <Button variant="outline" size="icon" title="Reload purchase history" aria-label="Reload purchase history" disabled={disabled} onClick={() => void reload()}><RefreshCw className="h-4 w-4" /></Button>
    </header>
    <div className="flex flex-wrap items-center gap-3 py-5">
      <label htmlFor="purchase-view" className="text-sm">Payment status</label>
      <select id="purchase-view" value={view} disabled={disabled || uncertain} className="h-10 max-w-full rounded-md border border-white/20 bg-slate-950 px-3 text-sm"
        onChange={event => { setView(event.target.value as PackageHistoryQuery['view']); setPage(1); setNotice('') }}>
        <option value="all">All purchases</option><option value="pending">Pending / failed</option><option value="paid">Paid</option><option value="refunded">Refunded</option><option value="review">Needs review</option>
      </select>
    </div>
    {(error || history.error) && <div role="alert" className="mb-5 border-l-2 border-rose-400 bg-rose-400/10 p-4 text-sm text-rose-100">
      <p className="break-words">{error || history.error}</p>
      <Button variant="outline" className="mt-3" disabled={disabled} onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" />Reload purchase state</Button>
    </div>}
    {notice && <p role="status" className="mb-4 text-sm text-emerald-300">{notice}</p>}
    {history.loading ? <div role="status" className="flex items-center gap-2 py-12"><Loader2 className="h-5 w-5 animate-spin" />Loading purchases</div> : history.data && <>
      {history.data.purchases.length === 0 ? <div className="py-10"><p>No package purchases in this view.</p>
        {role === 'PARENT' && <Link href="/browse" className="mt-3 inline-block text-sm text-emerald-300 underline">Find trainers</Link>}
      </div> : <ul className="divide-y divide-white/10">
        {history.data.purchases.map(purchase => <li key={purchase.id} className="grid min-w-0 gap-5 py-6 md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
          <div className="min-w-0">
            <h2 className="break-words text-lg font-semibold">{purchase.title}</h2>
            <p className="mt-1 break-all text-sm text-slate-300">{purchase.counterparty}</p>
            <p className="mt-2 text-sm">{packagePaymentLabel(purchase)}</p>
            {purchase.reviewRequired && <p className="mt-1 text-sm text-amber-200">Financial review required</p>}
            <dl className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-slate-400">Sessions</dt><dd>{purchase.totalSessions} &middot; Family-shared</dd>
              <dt className="text-slate-400">Credits recorded</dt><dd data-testid="package-credits-granted">{purchase.creditsGranted}</dd>
              <dt className="text-slate-400">Listed validity</dt><dd>{purchase.validForDays} days</dd>
              <dt className="text-slate-400">Purchase created</dt><dd>{new Date(purchase.createdAt).toLocaleDateString()}</dd>
              <dt className="text-slate-400">Payment date</dt><dd data-testid="package-paid-at" className="min-w-0 break-words">{purchase.paymentSucceededAt ? new Date(purchase.paymentSucceededAt).toLocaleString() : 'Not verified'}</dd>
              <dt className="text-slate-400">Valid until</dt><dd data-testid="package-expires-at" className="min-w-0 break-words">{purchase.expiresAt ? new Date(purchase.expiresAt).toLocaleString() : 'Not established'}</dd>
            </dl>
            <ul className="mt-4 space-y-1 text-sm text-slate-300">{purchase.items.map((item, index) => <li key={index} className="break-words">{item.sessionsCount} &times; {item.title} ({item.durationMinutes} min)</li>)}</ul>
            <p className="mt-3 text-sm text-amber-200">Session credits unavailable</p>
            <RefundSummary payment={purchase} />
          </div>
          <div className="min-w-0 md:text-right">
            <p className="text-xs text-slate-400">Package total</p><p className="break-words text-xl font-semibold">{formatCurrency(purchase.amountInCents)}</p>
            {purchase.trainerAllocationInCents !== null && <><p className="mt-2 text-sm text-slate-300">Original trainer allocation: {formatCurrency(purchase.trainerAllocationInCents)}</p><Link href="/trainer/profile?tab=payouts" className="mt-2 inline-block text-sm text-emerald-300 underline">Stripe payout status</Link></>}
            <Button variant="outline" className="mt-4 w-full md:w-auto" disabled={disabled || uncertain || !purchase.canRefresh} onClick={() => void refreshPayment(purchase.id)}>
              {busyId === purchase.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Refresh payment
            </Button>
            {!purchase.canRefresh && <p className="mt-2 text-xs text-slate-400">Checkout receipt unavailable</p>}
          </div>
        </li>)}
      </ul>}
      {pagination && <nav aria-label="Purchase pages" className="mt-5 flex items-center justify-center gap-3 border-t border-white/10 pt-5">
        <Button size="icon" variant="outline" title="Previous purchase page" aria-label="Previous purchase page" disabled={disabled || uncertain || pagination.page <= 1} onClick={() => setPage(pagination.page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="text-sm">Page {pagination.page} of {Math.max(1, pagination.totalPages)} ({pagination.total})</span>
        <Button size="icon" variant="outline" title="Next purchase page" aria-label="Next purchase page" disabled={disabled || uncertain || pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </nav>}
    </>}
  </main>
}
