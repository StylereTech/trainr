"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Eye, Sparkles } from 'lucide-react'

interface Report {
  id: string
  entityType: string
  entityId: string
  reason: string
  description: string | null
  status: string
  resolution: string | null
  resolvedAt: string | null
  createdAt: string
  reporter: { email: string } | null
  resolver: { email: string } | null
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-rose-500/15 text-rose-200',
  REVIEWING: 'bg-amber-500/15 text-amber-200',
  RESOLVED: 'bg-emerald-500/15 text-emerald-200',
  DISMISSED: 'bg-slate-500/20 text-slate-200',
}

export default function AdminDisputes() {
  const { toast } = useToast()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Report | null>(null)
  const [resolution, setResolution] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const limit = 20

  const fetchReports = async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (statusFilter !== 'all') params.set('status', statusFilter)

    const res = await fetch(`/api/admin/disputes?${params}`)
    if (res.ok) {
      const data = await res.json()
      setReports(data.reports || [])
      setTotal(data.pagination.total)
    }
    setLoading(false)
  }

  useEffect(() => { fetchReports() }, [page, statusFilter])

  const handleAction = async (reportId: string, action: string) => {
    setActionLoading(true)
    const res = await fetch('/api/admin/disputes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, action, resolution: action === 'resolve' ? resolution : 'Dismissed by admin' }),
    })
    if (res.ok) {
      toast({ title: `Report ${action}d` })
      setSelected(null)
      setResolution('')
      fetchReports()
    } else {
      const data = await res.json()
      toast({ title: 'Error', description: data.error, variant: 'destructive' })
    }
    setActionLoading(false)
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.14),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 md:p-7">
        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Trust & moderation</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Handle disputes inside the same polished command system as the rest of Trainr.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">Moderation review is now visually calmer, easier to scan on mobile, and better aligned with the premium private surfaces.</p>
      </div>

      <Card className="border-white/10 bg-white/[0.04] text-white">
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-12 w-full border-white/10 bg-slate-950/60 text-white sm:w-48"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="REVIEWING">Reviewing</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
                <SelectItem value="DISMISSED">Dismissed</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-slate-400">{total} report{total !== 1 ? 's' : ''}</span>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></div>
      ) : reports.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-300" />
            <h3 className="text-lg font-semibold">No reports</h3>
            <p className="text-sm text-slate-400">All clear. No moderation reports need review.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <Card key={r.id} className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-400/20 bg-rose-500/10"><AlertTriangle className="h-5 w-5 text-rose-300" /></div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm text-white">{r.entityType}</span>
                      <Badge className={statusColors[r.status] || ''}>{r.status}</Badge>
                    </div>
                    <div className="mt-2 text-sm text-slate-300">{r.reason}</div>
                    {r.description && <div className="mt-1 text-xs leading-6 text-slate-400">{r.description}</div>}
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span>Reporter: {r.reporter?.email || 'System'}</span>
                      <span>Created: {new Date(r.createdAt).toLocaleDateString()}</span>
                      {r.resolver && <span>Resolved by: {r.resolver.email}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    {r.status === 'OPEN' || r.status === 'REVIEWING' ? (
                      <>
                        <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => { setSelected(r); setResolution('') }}><Eye className="mr-1 h-3 w-3" />Review</Button>
                        <Button size="sm" className="gradient-primary border-0 text-white" onClick={() => handleAction(r.id, 'resolve')}><CheckCircle2 className="mr-1 h-3 w-3" />Resolve</Button>
                        <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-slate-200 hover:bg-white/10 hover:text-white" onClick={() => handleAction(r.id, 'dismiss')}><XCircle className="mr-1 h-3 w-3" />Dismiss</Button>
                      </>
                    ) : (
                      <span className="max-w-xs text-xs text-slate-400">{r.resolution}</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="border-white/10 bg-slate-950 text-white">
          <DialogHeader><DialogTitle>Resolve Report</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-slate-300">
              <strong className="text-white">Reason:</strong> {selected?.reason}<br />
              <strong className="text-white">Description:</strong> {selected?.description || 'N/A'}
            </div>
            <Textarea placeholder="Resolution notes..." value={resolution} onChange={(e) => setResolution(e.target.value)} rows={3} className="border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => setSelected(null)}>Cancel</Button>
              <Button className="gradient-primary flex-1 border-0 text-white" disabled={actionLoading || !resolution.trim()} onClick={() => selected && handleAction(selected.id, 'resolve')}>
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}Resolve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
