"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { Loader2, Plus, Tag, Calendar, Sparkles } from 'lucide-react'

interface Coupon {
  id: string
  code: string
  discountPercent: number | null
  discountAmountInCents: number | null
  maxUses: number
  currentUses: number
  expiresAt: string | null
  isActive: boolean
  applicableSport: { name: string } | null
  createdAt: string
}

export default function AdminCoupons() {
  const { toast } = useToast()
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const limit = 20

  const [form, setForm] = useState({
    code: '',
    discountType: 'percent' as 'percent' | 'fixed',
    discountPercent: 10,
    discountAmountInCents: 1000,
    maxUses: 100,
    expiresAt: '',
    applicableSportId: '',
  })

  const fetchCoupons = async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/coupons?page=${page}&limit=${limit}`)
    if (res.ok) {
      const data = await res.json()
      setCoupons(data.coupons || [])
      setTotal(data.pagination.total)
    }
    setLoading(false)
  }

  useEffect(() => { fetchCoupons() }, [page])

  const handleCreate = async () => {
    setCreating(true)
    const body: any = {
      code: form.code,
      maxUses: form.maxUses,
      expiresAt: form.expiresAt || undefined,
      applicableSportId: form.applicableSportId || undefined,
    }
    if (form.discountType === 'percent') body.discountPercent = form.discountPercent
    else body.discountAmountInCents = form.discountAmountInCents

    const res = await fetch('/api/admin/coupons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      toast({ title: 'Coupon created!' })
      setShowCreate(false)
      setForm({ code: '', discountType: 'percent', discountPercent: 10, discountAmountInCents: 1000, maxUses: 100, expiresAt: '', applicableSportId: '' })
      fetchCoupons()
    } else {
      const data = await res.json()
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
    setCreating(false)
  }

  const handleToggle = async (couponId: string, isActive: boolean) => {
    const res = await fetch('/api/admin/coupons', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ couponId, isActive: !isActive }),
    })
    if (res.ok) {
      toast({ title: `Coupon ${!isActive ? 'activated' : 'deactivated'}` })
      fetchCoupons()
    }
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Coupon system</Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Create promotional offers without breaking the premium admin flow.</h1>
            <p className="mt-3 text-sm leading-7 text-slate-300 md:text-base">Coupon cards, activation state, and the creation dialog are now visually aligned with the rest of Trainr private operations.</p>
          </div>
          <Button className="gradient-primary w-full border-0 text-white sm:w-auto" onClick={() => setShowCreate(true)}>
            <Plus className="mr-1 h-4 w-4" /> Create coupon
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></div>
      ) : coupons.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardContent className="py-12 text-center">
            <Tag className="mx-auto mb-3 h-12 w-12 text-slate-500" />
            <h3 className="text-lg font-semibold">No coupons yet</h3>
            <p className="text-sm text-slate-400">Create your first promotional code.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {coupons.map((coupon) => (
            <Card key={coupon.id} className={`border-white/10 bg-white/[0.04] text-white ${!coupon.isActive ? 'opacity-70' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <code className="rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-bold text-white">{coupon.code}</code>
                  <Switch checked={coupon.isActive} onCheckedChange={() => handleToggle(coupon.id, coupon.isActive)} />
                </div>
                <div className="mt-4 text-2xl font-semibold text-white">
                  {coupon.discountPercent ? `${coupon.discountPercent}% OFF` : formatCurrency(coupon.discountAmountInCents || 0)}
                </div>
                <div className="mt-3 space-y-2 text-sm text-slate-300">
                  <div>Used {coupon.currentUses} / {coupon.maxUses}</div>
                  {coupon.applicableSport && <div>Sport: {coupon.applicableSport.name}</div>}
                  {coupon.expiresAt && (
                    <div className="inline-flex items-center gap-1 text-slate-400"><Calendar className="h-3.5 w-3.5" /> Expires {new Date(coupon.expiresAt).toLocaleDateString()}</div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge className={coupon.isActive ? 'bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/15' : 'bg-slate-500/20 text-slate-200 hover:bg-slate-500/20'}>{coupon.isActive ? 'Active' : 'Inactive'}</Badge>
                  {coupon.currentUses >= coupon.maxUses && <Badge variant="outline" className="border-white/15 bg-white/5 text-slate-200">Maxed out</Badge>}
                  {coupon.expiresAt && new Date(coupon.expiresAt) < new Date() && <Badge variant="outline" className="border-rose-400/20 bg-rose-500/10 text-rose-200">Expired</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-slate-400">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md border-white/10 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>Create coupon</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Coupon code</Label>
              <Input placeholder="e.g. SUMMER2026" value={form.code} onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))} className="h-12 border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
            </div>
            <div className="space-y-2">
              <Label>Discount type</Label>
              <Select value={form.discountType} onValueChange={(v: any) => setForm((prev) => ({ ...prev, discountType: v }))}>
                <SelectTrigger className="border-white/10 bg-white/5 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percent">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.discountType === 'percent' ? (
              <div className="space-y-2">
                <Label>Discount percentage</Label>
                <Input type="number" min="1" max="100" value={form.discountPercent} onChange={(e) => setForm((prev) => ({ ...prev, discountPercent: parseInt(e.target.value) || 0 }))} className="h-12 border-white/10 bg-white/5 text-white" />
              </div>
            ) : (
              <div className="space-y-2">
                <Label>Discount amount (cents)</Label>
                <Input type="number" min="100" step="100" value={form.discountAmountInCents} onChange={(e) => setForm((prev) => ({ ...prev, discountAmountInCents: parseInt(e.target.value) || 0 }))} className="h-12 border-white/10 bg-white/5 text-white" />
                <p className="text-xs text-slate-400">${(form.discountAmountInCents / 100).toFixed(2)}</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Max uses</Label>
              <Input type="number" min="1" value={form.maxUses} onChange={(e) => setForm((prev) => ({ ...prev, maxUses: parseInt(e.target.value) || 1 }))} className="h-12 border-white/10 bg-white/5 text-white" />
            </div>
            <div className="space-y-2">
              <Label>Expires at (optional)</Label>
              <Input type="date" value={form.expiresAt} onChange={(e) => setForm((prev) => ({ ...prev, expiresAt: e.target.value }))} className="h-12 border-white/10 bg-white/5 text-white" />
            </div>
            <Button className="w-full gradient-primary border-0 text-white" onClick={handleCreate} disabled={creating || !form.code.trim()}>
              {creating ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
              Create coupon
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
