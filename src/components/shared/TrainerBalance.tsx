'use client'
import { DollarSign, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { PayoutBalance } from '@/lib/dashboard-contract'
import { formatCurrency } from '@/lib/utils'
export function TrainerBalance({ data, loading, error, reload }: { data: PayoutBalance | null; loading: boolean; error: string; reload: () => Promise<boolean> }) {
  return <div data-testid="trainer-balance" className="border-l border-white/10 p-4">
    <div className="flex items-center gap-2 text-xs uppercase text-slate-300"><DollarSign className="h-4 w-4 text-emerald-300" />Stripe available (USD)</div>
    <div className="mt-2 text-xl font-semibold">{loading ? <Loader2 aria-label="Loading balance" className="h-5 w-5 animate-spin" /> : error ? 'Unavailable' : data?.connected ? formatCurrency(data.wallet.availableBalance) : 'Not connected'}</div>
    {data?.connected && <p className="mt-1 text-xs text-slate-300">Pending: {formatCurrency(data.wallet.pendingBalance)}</p>}
    {!loading && <Button size="icon" variant="ghost" aria-label="Refresh Stripe balance" title="Refresh Stripe balance" onClick={() => void reload()}><RefreshCw className="h-4 w-4" /></Button>}
  </div>
}
