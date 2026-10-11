'use client'

import { useState } from 'react'
import { AlertTriangle, Clock, CreditCard, DollarSign, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { connectStatusSchema, stripeRedirect } from '@/lib/connect-contract'
import { payoutHistorySchema } from '@/lib/payout-contract'
import { useRemoteData } from '@/lib/use-remote-data'
import { formatCurrency } from '@/lib/utils'

export function TrainerPayouts() {
  const { toast } = useToast()
  const balance = useRemoteData('/api/trainer/wallet', payoutHistorySchema)
  const status = useRemoteData('/api/payments/connect', connectStatusSchema)
  const [opening, setOpening] = useState(false)
  const unknown = !status.data || !!status.error || !!status.data.providerError || !status.data.providerConfigured
  const ready = !unknown && status.data?.stripeOnboardingComplete && status.data.chargesEnabled === true && status.data.payoutsEnabled === true && status.data.transfersEnabled === true
  const started = !!status.data?.stripeAccountId
  const canOpen = !status.loading && !unknown && (status.data?.dashboardSupported || status.data?.onboardingSupported)
  const schedule = balance.data?.schedule?.interval

  async function openStripe() {
    if (!canOpen || opening) return
    setOpening(true)
    try {
      const response = await fetch('/api/payments/connect', { method: 'POST', signal: AbortSignal.timeout(20000) })
      if (!response.ok) throw new Error('Unable to open Stripe. Refresh your account status and try again.')
      const data = await response.json()
      const url = stripeRedirect(data.dashboardUrl || data.onboardingUrl)
      if (!url) throw new Error('Stripe did not return a valid account link.')
      window.location.href = url
    } catch (error) {
      toast({ title: 'Stripe setup unavailable', description: error instanceof Error ? error.message : 'Please retry.', variant: 'destructive' })
      setOpening(false)
      void status.reload()
    }
  }

  return (
    <section className="space-y-6" aria-label="Stripe earnings and payouts">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">Stripe Balance &amp; Bank Payouts</h2>
          <p className="mt-1 text-sm text-slate-300">
            {schedule === 'manual' ? 'Manual payout schedule. Check Stripe for available payout options.'
              : schedule ? `Bank payout schedule: ${schedule}.` : 'Bank payout schedule not yet verified.'}
          </p>
          <p role="status" className="mt-3 text-sm">
            {status.loading ? 'Checking Stripe' : unknown ? 'Stripe status unverified' : ready ? 'Payments ready' : started ? 'Setup in progress' : 'Stripe not started'}
          </p>
          {!status.loading && unknown && <p role="alert" className="mt-2 text-sm text-amber-200">Current Stripe status could not be verified. Refresh to try again.</p>}
          {!status.loading && !unknown && status.data?.transfersEnabled != null && <p className={`mt-2 text-sm ${status.data.transfersEnabled ? 'text-emerald-200' : 'text-amber-200'}`}>Transfers {status.data.transfersEnabled ? 'enabled' : 'not enabled'}</p>}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto">
          <Button variant="outline" onClick={() => void openStripe()} disabled={opening || !canOpen}>
            {opening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
            {opening ? 'Opening Stripe...' : ready ? 'Open Stripe dashboard' : started ? 'Resume Stripe setup' : 'Start Stripe setup'}
          </Button>
          <Button variant="outline" disabled={status.loading || opening} onClick={() => void status.reload()}><RefreshCw className="mr-2 h-4 w-4" />Refresh Stripe status</Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Stripe balances</h3>
        <Button variant="outline" size="icon" aria-label="Refresh Stripe balances" title="Refresh Stripe balances" disabled={balance.loading} onClick={() => void balance.reload()}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      {balance.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-rose-300">
          <AlertTriangle className="h-5 w-5 shrink-0" /><p className="min-w-0 flex-1">Unable to load current Stripe balances and payouts.</p>
          <Button variant="outline" onClick={() => void balance.reload()}>Retry</Button>
        </div>
      ) : balance.loading ? (
        <p role="status" className="flex items-center gap-2 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Loading Stripe balances...</p>
      ) : balance.data?.connected ? (
        <>
          <div className="grid gap-6 sm:grid-cols-2">
            {[
              { label: 'Available in Stripe (USD)', value: balance.data.wallet.availableBalance, icon: DollarSign },
              { label: 'Pending in Stripe (USD)', value: balance.data.wallet.pendingBalance, icon: Clock },
            ].map(item => (
              <div key={item.label} className="border-b border-white/10 pb-4">
                <div className="flex items-center gap-2 text-sm text-slate-300"><item.icon className="h-4 w-4" />{item.label}</div>
                <div className="mt-2 text-2xl font-semibold">{formatCurrency(item.value)}</div>
              </div>
            ))}
          </div>
          <div>
            <h3 className="mb-3 text-base font-semibold">Recent Bank Payouts</h3>
            {balance.data.payouts.length === 0 ? <p className="text-sm text-slate-300">No bank payouts reported by Stripe yet.</p> : (
              <ul className="divide-y divide-white/10">
                {balance.data.payouts.map(payout => (
                  <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{payout.currency === 'usd' ? formatCurrency(payout.amountInCents) : `${payout.amountInCents.toLocaleString('en-US')} ${payout.currency.toUpperCase()} minor units`}</p>
                      <p className="text-xs text-slate-400">Arrival estimate: {new Date(payout.arrivalDate * 1000).toLocaleDateString()}</p>
                    </div>
                    <Badge>{payout.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : <p className="text-sm text-slate-300">No connected Stripe balance is available yet.</p>}
    </section>
  )
}
