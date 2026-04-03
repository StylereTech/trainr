"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Settings, Save, Sparkles, CheckCircle2 } from 'lucide-react'

interface FeeConfig {
  id: string
  platformCommissionPercent: number
  stripeFeePercent: number
  processingFeeCents: number
  minBookingAmountCents: number
  isActive: boolean
  effectiveDate: string
  createdAt: string
}

export default function AdminSettings() {
  const { toast } = useToast()
  const [config, setConfig] = useState<FeeConfig | null>(null)
  const [history, setHistory] = useState<FeeConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    platformCommissionPercent: 15,
    stripeFeePercent: 2.9,
    processingFeeCents: 30,
    minBookingAmountCents: 1500,
  })

  useEffect(() => {
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        setHistory(data.configs || [])
        if (data.active) {
          setConfig(data.active)
          setForm({
            platformCommissionPercent: data.active.platformCommissionPercent,
            stripeFeePercent: data.active.stripeFeePercent,
            processingFeeCents: data.active.processingFeeCents,
            minBookingAmountCents: data.active.minBookingAmountCents,
          })
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        const newConfig = await res.json()
        setConfig(newConfig)
        toast({ title: 'Settings saved', description: 'New fee configuration is now active.' })
        const historyRes = await fetch('/api/admin/settings')
        if (historyRes.ok) {
          const data = await historyRes.json()
          setHistory(data.configs || [])
        }
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-300" /></div>

  const sampleSession = 100
  const platformFee = sampleSession * form.platformCommissionPercent / 100
  const trainerTake = sampleSession - platformFee

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Fee configuration</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Set platform economics from a cleaner private finance surface.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">Commission inputs, processing assumptions, and history now live inside the same premium admin system rather than a default settings panel.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.08fr_.92fr]">
        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Settings className="h-5 w-5 text-emerald-300" /> Current fee configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="commission">Platform commission (%)</Label>
                <Input id="commission" type="number" step="0.1" min="0" max="50" value={form.platformCommissionPercent} onChange={(e) => setForm((prev) => ({ ...prev, platformCommissionPercent: parseFloat(e.target.value) || 0 }))} className="h-12 border-white/10 bg-slate-950/60 text-white" />
                <p className="text-xs text-slate-400">Percent of each booking retained as platform fee.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="stripeFee">Stripe fee (%)</Label>
                <Input id="stripeFee" type="number" step="0.01" min="0" max="10" value={form.stripeFeePercent} onChange={(e) => setForm((prev) => ({ ...prev, stripeFeePercent: parseFloat(e.target.value) || 0 }))} className="h-12 border-white/10 bg-slate-950/60 text-white" />
                <p className="text-xs text-slate-400">Reference value for finance planning.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="processingCents">Processing fee (cents)</Label>
                <Input id="processingCents" type="number" min="0" step="1" value={form.processingFeeCents} onChange={(e) => setForm((prev) => ({ ...prev, processingFeeCents: parseInt(e.target.value) || 0 }))} className="h-12 border-white/10 bg-slate-950/60 text-white" />
                <p className="text-xs text-slate-400">Flat transaction fee in cents.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minBooking">Minimum booking amount (cents)</Label>
                <Input id="minBooking" type="number" min="0" step="100" value={form.minBookingAmountCents} onChange={(e) => setForm((prev) => ({ ...prev, minBookingAmountCents: parseInt(e.target.value) || 0 }))} className="h-12 border-white/10 bg-slate-950/60 text-white" />
                <p className="text-xs text-slate-400">Minimum session price allowed on platform.</p>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-5">
              <div className="text-sm font-semibold text-white">Example payout on a ${sampleSession} session</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Platform fee</div><div className="mt-2 text-2xl font-semibold text-white">${platformFee.toFixed(2)}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Trainer receives</div><div className="mt-2 text-2xl font-semibold text-white">${trainerTake.toFixed(2)}</div></div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="text-xs uppercase tracking-[0.18em] text-slate-400">Minimum booking</div><div className="mt-2 text-2xl font-semibold text-white">${(form.minBookingAmountCents / 100).toFixed(2)}</div></div>
              </div>
            </div>

            <Button className="w-full gradient-primary border-0 text-white" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Save configuration
            </Button>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle className="text-lg">Configuration history</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-4 rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Active config</div>
              <div className="mt-2">{config ? `${config.platformCommissionPercent}% commission • ${config.stripeFeePercent}% Stripe ref • $${(config.minBookingAmountCents / 100).toFixed(2)} minimum` : 'No active config found.'}</div>
            </div>
            {history.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/45 py-10 text-center text-slate-400">No history yet</div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className={`rounded-[1.5rem] border p-4 ${item.isActive ? 'border-emerald-400/20 bg-emerald-400/10' : 'border-white/10 bg-slate-950/45'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium text-white">{item.platformCommissionPercent}% commission</span>
                      {item.isActive && <Badge className="bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15">Active</Badge>}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">Effective {new Date(item.effectiveDate).toLocaleDateString()} • Stripe ref {item.stripeFeePercent}% • Min ${(item.minBookingAmountCents / 100).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
