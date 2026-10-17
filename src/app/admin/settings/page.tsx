"use client"

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, Settings, Save, RefreshCw, CheckCircle2 } from 'lucide-react'

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
  const [loadError, setLoadError] = useState('')
  const [stale, setStale] = useState(false)
  const [form, setForm] = useState({
    platformCommissionPercent: 15,
    stripeFeePercent: 2.9,
    processingFeeCents: 30,
    minBookingAmountCents: 1500,
  })

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const response = await fetch('/api/admin/settings', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to load fee settings.')
      const values = data.active || data.defaults
      if (!values || !Array.isArray(data.configs)) throw new Error('Invalid fee settings response.')
      setHistory(data.configs)
      setConfig(data.active)
      setForm({ platformCommissionPercent: values.platformCommissionPercent, stripeFeePercent: values.stripeFeePercent,
        processingFeeCents: values.processingFeeCents, minBookingAmountCents: values.minBookingAmountCents })
      setStale(false)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load fee settings.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void loadSettings() }, [loadSettings])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, expectedConfigId: config?.id || null }),
      })
      if (res.ok) {
        const newConfig = await res.json()
        setConfig(newConfig)
        setHistory((current) => [newConfig, ...current.map((item) => ({ ...item, isActive: false }))].slice(0, 10))
        toast({ title: 'Settings saved', description: 'New fee configuration is now active.' })
      } else {
        const data = await res.json()
        if (res.status === 409) setStale(true)
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
    setSaving(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-300" /></div>
  if (loadError) return <section className="space-y-4"><h1 className="text-2xl font-semibold">Fee settings</h1><p role="alert">{loadError}</p><Button onClick={loadSettings}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button></section>

  const sampleSession = 100
  const platformFee = sampleSession * form.platformCommissionPercent / 100
  const trainerTake = sampleSession - platformFee

  return (
    <div className="space-y-6 text-white">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Fee settings</h1>
        <Button variant="outline" onClick={loadSettings} disabled={saving}><RefreshCw className="mr-2 h-4 w-4" />Reload</Button>
      </div>
      {stale && <p role="alert" className="text-amber-300">Fee settings changed. Reload before saving.</p>}

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
                <Label htmlFor="stripeFee">Estimated Stripe fee (%)</Label>
                <Input id="stripeFee" type="number" step="0.01" min="0" max="10" value={form.stripeFeePercent} onChange={(e) => setForm((prev) => ({ ...prev, stripeFeePercent: parseFloat(e.target.value) || 0 }))} className="h-12 border-white/10 bg-slate-950/60 text-white" />
                <p className="text-xs text-slate-400">Reference value for finance planning.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="processingCents">Estimated processing fee (cents)</Label>
                <Input id="processingCents" type="number" min="0" step="1" value={form.processingFeeCents} onChange={(e) => setForm((prev) => ({ ...prev, processingFeeCents: parseInt(e.target.value) || 0 }))} className="h-12 border-white/10 bg-slate-950/60 text-white" />
                <p className="text-xs text-slate-400">Reference estimate, not an additional parent charge.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minBooking">Minimum booking amount (cents)</Label>
                <Input id="minBooking" type="number" min="1500" max="10000000" step="1" value={form.minBookingAmountCents} onChange={(e) => setForm((prev) => ({ ...prev, minBookingAmountCents: Number(e.target.value) }))} className="h-12 border-white/10 bg-slate-950/60 text-white" />
                <p className="text-xs text-slate-400">Minimum service price before discounts.</p>
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

            <Button className="w-full gradient-primary border-0 text-white" onClick={handleSave} disabled={saving || stale}>
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
