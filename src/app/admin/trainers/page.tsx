"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Loader2, CheckCircle2, XCircle, Eye, Sparkles, ShieldCheck, Clock3, ArrowUpRight } from 'lucide-react'

interface PendingTrainer {
  id: string
  firstName: string
  lastName: string
  slug: string
  headline: string | null
  bio: string | null
  yearsExperience: number
  locationType: string
  city: string | null
  state: string | null
  createdAt: string
  sports: { sport: { name: string; icon: string } }[]
  user: { email: string; createdAt: string }
  _count?: { bookings: number; reviews: number }
}

export default function AdminTrainers() {
  const { toast } = useToast()
  const [trainers, setTrainers] = useState<PendingTrainer[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTrainer, setSelectedTrainer] = useState<PendingTrainer | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [dialogMode, setDialogMode] = useState<'approve' | 'reject' | 'view'>('view')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchTrainers = async () => {
    setLoading(true)
    const res = await fetch('/api/admin?view=trainers-pending')
    if (res.ok) {
      const data = await res.json()
      setTrainers(data.trainers || [])
    }
    setLoading(false)
  }

  useEffect(() => { fetchTrainers() }, [])

  const handleAction = async (trainerId: string, action: string, reason?: string) => {
    setActionLoading(true)
    try {
      const res = await fetch(`/api/admin/trainers/${trainerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, reason }),
      })
      if (res.ok) {
        toast({ title: `Trainer ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'updated'}` })
        setSelectedTrainer(null)
        setRejectReason('')
        fetchTrainers()
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
    setActionLoading(false)
  }

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 md:p-7">
        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Trainer approvals</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Review applicants in the same premium command flow as the rest of admin.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">This page now prioritizes trust signals, profile clarity, and mobile-safe decision controls instead of default stacked cards.</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {[
            { label: 'Pending trainers', value: trainers.length.toString(), note: 'awaiting review' },
            { label: 'Profile checks', value: trainers.filter((trainer) => !!trainer.headline && !!trainer.bio).length.toString(), note: 'headline + bio present' },
            { label: 'With location', value: trainers.filter((trainer) => !!trainer.city && !!trainer.state).length.toString(), note: 'city/state included' },
            { label: 'Ready to process', value: trainers.length > 0 ? 'Yes' : 'Clear', note: 'action queue state' },
          ].map((item) => (
            <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
              <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">{item.label}</div>
              <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
              <div className="mt-1 text-xs text-slate-400">{item.note}</div>
            </div>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-300" /></div>
      ) : trainers.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-300" />
            <h3 className="text-lg font-semibold">All caught up</h3>
            <p className="text-sm text-slate-400">No pending trainer applications right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {trainers.map((trainer) => (
            <Card key={trainer.id} className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-4 md:p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/60 text-lg font-semibold text-white">
                    {trainer.firstName[0]}{trainer.lastName[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-white">{trainer.firstName} {trainer.lastName}</h3>
                      <Badge className="bg-amber-500/15 text-amber-200 hover:bg-amber-500/15">Pending</Badge>
                    </div>
                    <p className="mt-2 text-sm text-slate-300">{trainer.headline || 'No headline added yet.'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {trainer.sports.map((sport, index) => (
                        <Badge key={index} variant="outline" className="border-white/15 bg-white/5 text-slate-200">{sport.sport.icon} {sport.sport.name}</Badge>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Applied {new Date(trainer.createdAt).toLocaleDateString()}</span>
                      <span>{trainer.yearsExperience} years experience</span>
                      <span>{trainer.locationType}</span>
                      {trainer.city && trainer.state && <span>{trainer.city}, {trainer.state}</span>}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{trainer.user.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Button size="sm" className="gradient-primary border-0 text-white" onClick={() => handleAction(trainer.id, 'approve')} disabled={actionLoading}>
                      <CheckCircle2 className="mr-1 h-3 w-3" />Approve
                    </Button>
                    <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => { setSelectedTrainer(trainer); setDialogMode('reject') }}>
                      <XCircle className="mr-1 h-3 w-3" />Reject
                    </Button>
                    <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => { setSelectedTrainer(trainer); setDialogMode('view') }}>
                      <Eye className="mr-1 h-3 w-3" />View
                    </Button>
                    <Link href={`/trainer/${trainer.slug}`}>
                      <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white">
                        Public page <ArrowUpRight className="ml-1 h-3 w-3" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedTrainer} onOpenChange={(open) => !open && setSelectedTrainer(null)}>
        <DialogContent className="max-w-2xl border-white/10 bg-slate-950 text-white">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === 'reject' ? 'Reject application' : `Trainer review — ${selectedTrainer?.firstName} ${selectedTrainer?.lastName}`}
            </DialogTitle>
          </DialogHeader>
          {selectedTrainer && dialogMode === 'view' && (
            <div className="space-y-4 py-2">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Account</div>
                  <div className="mt-2 font-semibold text-white">{selectedTrainer.user.email}</div>
                  <div className="mt-1 text-sm text-slate-400">Joined {new Date(selectedTrainer.user.createdAt).toLocaleDateString()}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Review snapshot</div>
                  <div className="mt-2 text-sm text-slate-300">{selectedTrainer.yearsExperience} years • {selectedTrainer.locationType}{selectedTrainer.city && selectedTrainer.state ? ` • ${selectedTrainer.city}, ${selectedTrainer.state}` : ''}</div>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Headline</div>
                <div className="mt-2 text-sm text-slate-200">{selectedTrainer.headline || 'N/A'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Bio</div>
                <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{selectedTrainer.bio || 'N/A'}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedTrainer.sports.map((sport, index) => (
                  <Badge key={index} variant="outline" className="border-white/15 bg-white/5 text-slate-200">{sport.sport.icon} {sport.sport.name}</Badge>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1 gradient-primary border-0 text-white" onClick={() => handleAction(selectedTrainer.id, 'approve')} disabled={actionLoading}>
                  <CheckCircle2 className="mr-1 h-4 w-4" />Approve
                </Button>
                <Button variant="outline" className="flex-1 border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => setDialogMode('reject')}>
                  <XCircle className="mr-1 h-4 w-4" />Reject
                </Button>
              </div>
            </div>
          )}
          {selectedTrainer && dialogMode === 'reject' && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-slate-400">Provide a clean reason for rejecting {selectedTrainer.firstName}&apos;s application.</p>
              <Textarea placeholder="Rejection reason..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} className="border-white/10 bg-white/5 text-white placeholder:text-slate-500" />
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => setDialogMode('view')}>Cancel</Button>
                <Button variant="destructive" className="flex-1" onClick={() => handleAction(selectedTrainer.id, 'reject', rejectReason)} disabled={actionLoading || !rejectReason.trim()}>
                  {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="mr-1 h-4 w-4" />}Reject
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Card className="border-white/10 bg-white/[0.04] text-white">
        <CardHeader className="pb-3"><CardTitle className="text-base">Approval pass consistency</CardTitle></CardHeader>
        <CardContent className="text-sm text-slate-300">Trainer approvals now match the premium admin shell, with tighter mobile rows, stronger status cues, and cleaner reviewer dialogs.</CardContent>
      </Card>
    </div>
  )
}
