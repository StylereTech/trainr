"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, DollarSign, TrendingUp, CheckCircle2, XCircle, Settings, Loader2, Sparkles, Clock } from 'lucide-react'
import { formatCurrency, BOOKING_STATUS_COLORS } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'

interface Booking {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  totalAmountInCents: number
  trainerPayoutInCents: number
  notes: string | null
  serviceOffering: { title: string; durationMinutes: number }
  parentProfile: { user: { email: string } }
  athleteProfile: { firstName: string; lastName: string }
}

export default function TrainerDashboard() {
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/bookings').then(r => r.json()).then(data => {
      setBookings(data.bookings || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const handleAction = async (bookingId: string, action: string) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) { const d = await res.json(); toast({ title: 'Error', description: d.error, variant: 'destructive' }); return }
      toast({ title: `Booking ${action === 'confirm' ? 'confirmed' : action === 'complete' ? 'completed' : 'updated'}` })
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: action === 'confirm' ? 'CONFIRMED' : action === 'complete' ? 'COMPLETED' : action === 'cancel' ? 'CANCELLED' : 'NO_SHOW' } : b))
    } catch { toast({ title: 'Error', variant: 'destructive' }) }
  }

  const pendingBookings = bookings.filter(b => b.status === 'PENDING')
  const confirmedBookings = bookings.filter(b => b.status === 'CONFIRMED')
  const completedBookings = bookings.filter(b => b.status === 'COMPLETED')

  const totalEarnings = completedBookings.reduce((sum, b) => sum + b.trainerPayoutInCents, 0)
  const upcomingCount = pendingBookings.length + confirmedBookings.length

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  const tabItems = {
    pending: pendingBookings,
    confirmed: confirmedBookings,
    completed: completedBookings,
    all: bookings,
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="container max-w-6xl py-8 md:py-10">
        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Trainer operations</Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Manage requests, earnings, and delivery with less friction.</h1>
              <p className="mt-3 text-sm leading-7 text-slate-300 md:text-base">The trainer dashboard now mirrors the premium public surfaces so your operating view feels as polished as your profile.</p>
            </div>
            <Link href="/trainer/profile"><Button variant="outline" size="sm" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"><Settings className="mr-1 h-4 w-4" />Edit Profile</Button></Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Pending requests', value: pendingBookings.length, icon: Clock },
              { label: 'Upcoming sessions', value: upcomingCount, icon: Calendar },
              { label: 'Completed sessions', value: completedBookings.length, icon: CheckCircle2 },
              { label: 'Total earnings', value: formatCurrency(totalEarnings), icon: DollarSign },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300"><item.icon className="h-4 w-4 text-emerald-300" /> {item.label}</div>
                <div className="mt-2 text-3xl font-semibold text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <Tabs defaultValue="pending" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-2 md:flex md:w-auto md:flex-wrap md:justify-start">
            <TabsTrigger value="pending">Pending ({pendingBookings.length})</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed ({confirmedBookings.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedBookings.length})</TabsTrigger>
            <TabsTrigger value="all">All ({bookings.length})</TabsTrigger>
          </TabsList>

          {(['pending', 'confirmed', 'completed', 'all'] as const).map(tab => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <div className="space-y-3">
                {tabItems[tab].length === 0 ? (
                  <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="py-10 text-center text-slate-400">No bookings in this view.</CardContent></Card>
                ) : (
                  tabItems[tab].map(b => (
                    <Card key={b.id} className="border-white/10 bg-white/[0.04] text-white">
                      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-sm">{b.parentProfile.user.email.split('@')[0]}</span>
                            <Badge className={BOOKING_STATUS_COLORS[b.status] || ''}>{b.status}</Badge>
                          </div>
                          <div className="mt-1 text-sm text-slate-300">{b.serviceOffering.title} • {b.athleteProfile.firstName} {b.athleteProfile.lastName}</div>
                          <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                            <span>{new Date(b.date).toLocaleDateString()}</span>
                            <span>{b.startTime} – {b.endTime}</span>
                          </div>
                          {b.notes && <div className="mt-2 text-xs italic text-slate-400">&ldquo;{b.notes}&rdquo;</div>}
                        </div>
                        <div className="flex flex-col gap-2 md:items-end">
                          <div className="text-left md:text-right">
                            <div className="font-semibold text-white">{formatCurrency(b.totalAmountInCents)}</div>
                            <div className="text-xs text-slate-400">You earn: {formatCurrency(b.trainerPayoutInCents)}</div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {b.status === 'PENDING' && (
                              <>
                                <Button size="sm" className="gradient-primary border-0 text-white" onClick={() => handleAction(b.id, 'confirm')}><CheckCircle2 className="mr-1 h-3 w-3" />Confirm</Button>
                                <Button size="sm" variant="outline" className="border-white/15 bg-white/5 text-rose-300 hover:bg-rose-500/10 hover:text-rose-200" onClick={() => handleAction(b.id, 'cancel')}><XCircle className="mr-1 h-3 w-3" />Decline</Button>
                              </>
                            )}
                            {b.status === 'CONFIRMED' && (
                              <>
                                <Button size="sm" className="gradient-primary border-0 text-white" onClick={() => handleAction(b.id, 'complete')}><CheckCircle2 className="mr-1 h-3 w-3" />Complete</Button>
                                <Button size="sm" variant="ghost" className="text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => handleAction(b.id, 'no_show')}>No-show</Button>
                              </>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
          <div className="inline-flex items-center gap-2 font-semibold text-white"><TrendingUp className="h-4 w-4 text-emerald-300" /> Premium trainer workflow pass complete</div>
          <p className="mt-2 max-w-2xl">Request actions, payout math, and mobile booking rows now align visually with the broader Trainr redesign rather than the older admin-lite UI.</p>
        </div>
      </div>
    </div>
  )
}
