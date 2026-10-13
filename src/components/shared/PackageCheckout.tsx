'use client'

import { useRef, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarCheck, CreditCard, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRemoteData } from '@/lib/use-remote-data'
import { packageReviewResponse } from '@/lib/package-sales-schema'
import { packageRefreshResponse } from '@/lib/package-history-schema'
import { clearPackageRequest, PackageCheckoutClientError, packageStorageKey, parsePackageRequest, readPackageRequest, requestPackageCheckout, savePackageRequest } from '@/lib/package-checkout-client'
import { formatCurrency } from '@/lib/utils'

const changed = 'trainr-package-request'
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback); window.addEventListener(changed, callback)
  return () => { window.removeEventListener('storage', callback); window.removeEventListener(changed, callback) }
}
const notify = () => window.dispatchEvent(new Event(changed))
const readySnapshot = () => true, serverReady = () => false, serverStorage = () => null

export function PackageCheckout({ buyerId, packageId, purchaseId }: { buyerId: string; packageId?: string; purchaseId?: string }) {
  const router = useRouter(), inFlight = useRef(false)
  const key = packageId ? packageStorageKey(buyerId, packageId) : null
  const ready = useSyncExternalStore(subscribe, readySnapshot, serverReady)
  const raw = useSyncExternalStore(subscribe, () => {
    try { return key ? readPackageRequest(window.sessionStorage, key) : null } catch { return '!unavailable' }
  }, serverStorage)
  const pending = parsePackageRequest(raw, packageId), storageError = key && pending === undefined
  const query = purchaseId ? `purchaseId=${encodeURIComponent(purchaseId)}` : `packageId=${encodeURIComponent(packageId || '')}${pending ? `&requestId=${pending.request.requestId}` : ''}`
  const review = useRemoteData(`/api/package-purchases/review?${query}`, packageReviewResponse)
  const data = review.data?.buyerId === buyerId && (!packageId || review.data.packageId === packageId) && (!purchaseId || review.data.purchaseId === purchaseId) ? review.data : null
  const identityError = !!review.data && !data
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [acceptedFor, setAcceptedFor] = useState('')
  const identity = data ? JSON.stringify([data.purchaseId, data.catalogRevision, data.amountInCents, data.terms]) : ''
  const accepted = !!identity && acceptedFor === identity
  const checkout = async () => {
    if (inFlight.current || !ready || !data || !accepted || !data.canCheckout || storageError) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      let input
      if (data.purchaseId) input = { purchaseId: data.purchaseId }
      else {
        if (!key) throw new Error('Package purchase identity is unavailable. Reload before paying.')
        const saved = pending || { request: { requestId: crypto.randomUUID(), packageId: data.packageId,
          catalogRevision: data.catalogRevision, expectedTotalInCents: data.amountInCents } }
        try { savePackageRequest(window.sessionStorage, key, saved); notify() }
        catch { throw new Error('Checkout recovery could not be saved. No payment request was sent.') }
        input = saved.request
      }
      const result = await requestPackageCheckout(input)
      window.location.assign(result.checkoutUrl)
    } catch (cause) {
      if (cause instanceof PackageCheckoutClientError && cause.offerChanged && key) {
        try { clearPackageRequest(window.sessionStorage, key); notify(); setAcceptedFor(''); await review.reload() }
        catch { setError('Saved checkout could not be cleared. Review your purchases.'); return }
      }
      setError(cause instanceof Error ? cause.message : 'Checkout could not be verified. Review your purchases.')
    } finally { inFlight.current = false; setBusy(false) }
  }
  const refreshPayment = async () => {
    if (inFlight.current || !data?.purchaseId) return
    inFlight.current = true; setBusy(true); setError('')
    try {
      const response = await fetch('/api/package-purchases/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId: data.purchaseId }), signal: AbortSignal.timeout(15000), redirect: 'error' })
      const result = packageRefreshResponse.safeParse(await response.json())
      if (!response.ok || !result.success || result.data.purchaseId !== data.purchaseId) throw new Error('Payment refresh could not be verified. Review your purchase history.')
      if (!await review.reload()) throw new Error('Payment refreshed, but purchase details could not be loaded.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Payment refresh could not be verified.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const buyAgain = () => {
    if (!data?.canBuyAgain || inFlight.current) return
    try {
      clearPackageRequest(window.sessionStorage, packageStorageKey(buyerId, data.packageId)); notify(); setAcceptedFor(''); setError('')
      if (packageId) void review.reload()
      else router.push(`/parent/packages/buy/${encodeURIComponent(data.packageId)}`)
    } catch { setError('Saved checkout could not be cleared. Review your purchases.') }
  }
  return <main className="container max-w-3xl py-6 md:py-8">
    <Link href="/parent/packages" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-300"><ArrowLeft className="h-4 w-4" />My package purchases</Link>
    <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
      <h1 className="min-w-0 text-2xl font-semibold">{purchaseId || data?.purchaseId ? 'Review package purchase' : 'Review package'}</h1>
      <Button size="icon" variant="outline" className="shrink-0" title="Reload package details" aria-label="Reload package details" disabled={busy || review.loading} onClick={() => void review.reload()}><RefreshCw className="h-4 w-4" /></Button>
    </header>
    {(error || review.error || storageError || identityError) && <div role="alert" className="my-5 border-l-2 border-amber-400 p-4 text-sm text-amber-100">
      <p className="break-words">{storageError ? 'Saved checkout recovery is unavailable. Review your purchases before starting another payment.' : identityError ? 'Purchase details did not match this account or package. Reload before paying.' : error || review.error}</p>
      <Link href="/parent/packages" className="mt-2 inline-block underline">Review purchase history</Link>
    </div>}
    {review.loading || !ready ? <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Loading package</p> : data && <>
      <section className="border-b border-white/10 py-5">
        <h2 className="break-words text-xl font-semibold">{data.terms.title}</h2>
        <Link href={`/trainers/${encodeURIComponent(data.trainerSlug)}`} className="mt-2 inline-block break-words text-sm text-emerald-300 underline">{data.trainerName}</Link>
        {data.terms.description && <p className="mt-4 whitespace-pre-wrap break-words text-sm text-slate-300">{data.terms.description}</p>}
        <ul className="mt-5 divide-y divide-white/10">{data.terms.items.map(item => <li key={item.serviceOfferingId} className="flex min-w-0 gap-3 py-3 text-sm">
          <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /><span className="min-w-0 break-words">{item.sessionsCount} &times; {item.title} &middot; {item.durationMinutes} min &middot; {item.type === 'INDIVIDUAL' ? '1-on-1' : item.type === 'GROUP' ? 'Group' : 'Virtual'}</span>
        </li>)}</ul>
      </section>
      <section className="border-b border-white/10 py-5 text-sm">
        <p>{data.terms.totalSessions} sessions{data.terms.version === 2 ? ' shared across your children' : ''}</p>
        {data.terms.version === 2 ? <><p className="mt-3">Valid for {data.terms.validForDays} days from successful payment. Sessions must start before expiry. Booking is subject to trainer availability.</p>
          <p className="mt-3 text-slate-300">Parent cancellation at least 24 hours before a session returns the credit. Later cancellation or no-show uses it. Trainer cancellation returns the credit. Original expiry and payment restrictions still apply. Cash refunds are separate.</p></>
          : <p className="mt-3 text-amber-200">Legacy purchase terms require support review. Listed validity: {data.terms.validForDays} days.</p>}
        {data.status && <p className="mt-4 font-medium">{data.status === 'SUCCEEDED' ? 'Payment recorded' : data.status === 'PROCESSING' ? 'Payment processing' : data.status === 'REFUNDED' ? 'Refund recorded' : data.status === 'PARTIALLY_REFUNDED' ? 'Partial refund recorded' : 'Payment not recorded'}</p>}
        {data.hold && <p role="status" className="mt-3 break-words text-amber-200">{data.hold}</p>}
        {pending && !data.purchaseId && <p className="mt-3 text-amber-200">Saved checkout request: {formatCurrency(pending.request.expectedTotalInCents)}. Retrying uses the same request.</p>}
      </section>
      <section className="py-6">
        <p className="text-sm text-slate-300">Package total &middot; USD</p><p className="mt-1 break-words text-2xl font-semibold">{formatCurrency(data.amountInCents)}</p>
        {data.canCheckout && <form className="mt-5 space-y-5" onSubmit={event => { event.preventDefault(); void checkout() }}>
          <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500" checked={accepted} disabled={busy || !!storageError} onChange={event => setAcceptedFor(event.target.checked ? identity : '')} />
            <span>I agree to the package terms above and the <Link href="/legal/refunds" className="underline">refund policy</Link>.</span></label>
          <Button type="submit" className="w-full sm:w-auto" disabled={busy || !accepted || !!storageError}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}{pending || data.purchaseId ? 'Continue saved checkout' : 'Pay in full with Stripe'}</Button>
        </form>}
        {data.purchaseId && <div className="mt-5 flex flex-wrap gap-3">
          <Button variant="outline" disabled={busy} onClick={() => void refreshPayment()}><RefreshCw className="mr-2 h-4 w-4" />Refresh payment</Button>
          <Button asChild variant="outline"><Link href={`/parent/packages/${encodeURIComponent(data.purchaseId)}/book`}><CalendarCheck className="mr-2 h-4 w-4" />View session credits</Link></Button>
          {data.canBuyAgain && <Button variant="outline" disabled={busy} onClick={buyAgain}><CreditCard className="mr-2 h-4 w-4" />Review another purchase</Button>}
        </div>}
        {!data.canCheckout && !data.canBuyAgain && <Link href="/contact" className="mt-4 inline-block text-sm text-emerald-300 underline">Contact support</Link>}
      </section>
    </>}
  </main>
}
