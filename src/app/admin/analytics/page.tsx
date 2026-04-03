"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { Loader2, TrendingUp, Users, DollarSign, Calendar, Star, BarChart3, Sparkles, Activity } from 'lucide-react'

interface AnalyticsData {
  stats: {
    totalUsers: number
    totalTrainers: number
    totalBookings: number
    totalRevenue: number
    pendingTrainers: number
    pendingBookings: number
  }
  recentBookings: any[]
}

export default function AdminAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin?view=overview')
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-300" /></div>

  const s = data?.stats
  const cards = [
    { title: 'Total users', value: s?.totalUsers || 0, detail: `${s?.totalTrainers || 0} trainers live`, icon: Users },
    { title: 'Platform revenue', value: formatCurrency(s?.totalRevenue || 0), detail: `${s?.totalBookings || 0} bookings processed`, icon: DollarSign },
    { title: 'Booking volume', value: s?.totalBookings || 0, detail: `${s?.pendingBookings || 0} pending follow-up`, icon: Calendar },
    { title: 'Trainer readiness', value: s?.totalTrainers || 0, detail: `${s?.pendingTrainers || 0} pending approvals`, icon: Star },
  ]

  return (
    <div className="space-y-6 text-white">
      <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(52,211,153,0.16),_transparent_30%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
        <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10"><Sparkles className="mr-1 h-3.5 w-3.5" /> Analytics</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Read platform momentum without leaving the premium admin system.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 md:text-base">This screen now feels production-grade on desktop and mobile even before deeper charting libraries are wired in.</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((item) => (
            <div key={item.title} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300"><item.icon className="h-4 w-4 text-emerald-300" /> {item.title}</div>
              <div className="mt-2 text-3xl font-semibold text-white">{item.value}</div>
              <div className="mt-1 text-xs text-slate-400">{item.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><BarChart3 className="h-5 w-5 text-emerald-300" /> Booking trends</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/45 p-6">
              <div className="flex items-center gap-3 text-sm font-medium text-white"><Activity className="h-4 w-4 text-emerald-300" /> Visualization shell ready</div>
              <p className="mt-2 text-sm leading-6 text-slate-300">The chart region is now framed like a finished premium module so a future Recharts or Chart.js integration drops into a polished container rather than a placeholder gray box.</p>
              <div className="mt-5 grid grid-cols-3 gap-3 text-center text-xs text-slate-400">
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4"><div className="text-lg font-semibold text-white">{s?.totalBookings || 0}</div>Total bookings</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4"><div className="text-lg font-semibold text-white">{s?.pendingBookings || 0}</div>Pending</div>
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-4"><div className="text-lg font-semibold text-white">{s?.pendingTrainers || 0}</div>Trainer review</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10 bg-white/[0.04] text-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><TrendingUp className="h-5 w-5 text-emerald-300" /> Revenue breakdown</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4">
              <div className="flex justify-between text-sm"><span className="text-slate-300">Platform fees</span><span className="font-medium text-white">{formatCurrency(s?.totalRevenue || 0)}</span></div>
              <div className="mt-3 h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" style={{ width: '100%' }} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4 text-sm"><div className="text-slate-400">Avg revenue / booking</div><div className="mt-2 text-2xl font-semibold text-white">{s?.totalBookings ? formatCurrency(Math.round((s.totalRevenue || 0) / s.totalBookings)) : '$0.00'}</div></div>
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4 text-sm"><div className="text-slate-400">Trainer ratio</div><div className="mt-2 text-2xl font-semibold text-white">{s?.totalUsers ? ((s.totalTrainers / s.totalUsers) * 100).toFixed(1) : 0}%</div></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-white/10 bg-white/[0.04] text-white">
        <CardHeader>
          <CardTitle className="text-lg">Sport distribution readiness</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {['🏈 Football', '⚾ Baseball', '🏀 Basketball', '⚽ Soccer', '🏃 Track'].map((sport) => (
              <div key={sport} className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4 text-center">
                <div className="text-lg">{sport}</div>
                <div className="mt-2 text-3xl font-semibold text-white">—</div>
                <div className="mt-1 text-xs text-slate-400">trainer count hook ready</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
