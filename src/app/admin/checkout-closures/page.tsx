'use client'

import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, RefreshCw, LockKeyhole } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRemoteData } from '@/lib/use-remote-data'
import { closureList, closureResult, closureLabel, closureOutcome } from '@/lib/account-checkout-closure-schema'

export default function CheckoutClosuresPage() {
  const [page, setPage] = useState(1)
  const queue = useRemoteData(`/api/admin/checkout-closures?page=${page}`, closureList)
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState('')
  const inFlight = useRef(false)
  const reload = async () => { if (await queue.reload()) { setUncertain(false); setMessage('') } }
  const close = async (id: string) => {
    if (inFlight.current || uncertain || queue.loading) return
    inFlight.current = true; setBusy(true); setMessage('')
    try {
      const response = await fetch('/api/admin/checkout-closures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }), signal: AbortSignal.timeout(40000) })
      if (!response.ok) throw new Error('unconfirmed')
      const result = closureResult.parse(await response.json())
      if (result.id !== id) throw new Error('identity')
      if (!await queue.reload()) throw new Error('reload')
      setMessage(closureOutcome(result.outcome))
    } catch { setUncertain(true); setMessage('Closure result is unconfirmed. Reload the queue before retrying.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const locked = busy || queue.loading || uncertain || !!queue.error
  return <section className="space-y-5 text-white">
    <header className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
      <h1 className="text-2xl font-semibold">Account checkout closures</h1>
      <Button variant="outline" size="icon" title="Reload closure queue" aria-label="Reload closure queue" disabled={busy || queue.loading} onClick={() => void reload()}><RefreshCw className="h-4 w-4" /></Button>
    </header>
    {queue.loading && <p role="status">Loading checkout closures...</p>}
    {(queue.error || message) && <p role={queue.error || uncertain ? 'alert' : 'status'} className="break-words text-amber-200">{queue.error || message}</p>}
    {queue.data?.rows.length === 0 && <p>No account checkout closures.</p>}
    <ul className="divide-y divide-white/10">{queue.data?.rows.map(row => <li key={row.id} className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 space-y-1">
        <h2 className="font-semibold">{row.kind === 'BOOKING' ? 'Booking checkout' : 'Package checkout'}</h2>
        <p className="break-all text-xs text-slate-400">{row.id}</p>
        <p className="break-all text-xs text-slate-400">{row.kind === 'BOOKING' ? 'Payment' : 'Purchase'}: {row.targetId}</p>
        <p className="break-all text-xs text-slate-400">Affected account: {row.userId}</p>
        <p>{closureLabel(row.status)}</p><p className="text-sm text-slate-300">{closureOutcome(row.outcome)}</p>
        {row.checkedAt && <p className="text-xs text-slate-400">Checked {new Date(row.checkedAt).toLocaleString()}</p>}
      </div>
      <Button variant="outline" className="shrink-0" disabled={locked || row.status === 'CLOSED'} onClick={() => void close(row.id)}><LockKeyhole className="mr-2 h-4 w-4" />Verify and close</Button>
    </li>)}</ul>
    <nav aria-label="Closure pagination" className="flex items-center gap-3">
      <Button variant="outline" size="icon" aria-label="Previous page" title="Previous page" disabled={locked || !queue.data || queue.data.page <= 1} onClick={() => setPage((queue.data?.page || 1) - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <span>Page {queue.data?.page || page} of {Math.max(1, queue.data?.totalPages || 1)}</span>
      <Button variant="outline" size="icon" aria-label="Next page" title="Next page" disabled={locked || !queue.data || queue.data.page >= queue.data.totalPages} onClick={() => setPage((queue.data?.page || 1) + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </nav>
  </section>
}
