"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, BOOKING_STATUS_COLORS } from '@/lib/utils'
import { formatBookingDate } from '@/lib/booking-date'
import { Users, UserCheck, Calendar, DollarSign, Clock, ArrowRight, Loader2, ShieldCheck, Activity } from 'lucide-react'

interface DashboardStats {
  totalUsers: number
  totalTrainers: number
  totalBookings: number
  totalRevenue: number
  pendingTrainers: number
  pendingBookings: number
}

interface RecentBooking {
  id: string
  date: string
  startTime: string
  timeZone: string | null
  status: string
  totalAmountInCents: number
  trainerProfile: { firstName: string; lastName: string }
  parentProfile: { user: { email: string } }
  serviceOffering: { title: string }
}

export default function AdminOverview() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [bookings, setBookings] = useState<RecentBooking[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin?view=overview')
      .then(r => r.json())
      .then(data => {
        setStats(data.stats)
        setBookings(data.recentBookings || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-emerald-300" /></div>

  const cards = [
    { label: 'Total users', value: stats?.totalUsers || 0, helper: 'Parents, trainers, and admins', icon: Users },
    { label: 'Active trainers', value: stats?.totalTrainers || 0, helper: `${stats?.pendingTrainers || 0} pending approval`, icon: UserCheck },
    { label: 'Total bookings', value: stats?.totalBookings || 0, helper: `${stats?.pendingBookings || 0} awaiting action`, icon: Calendar },
    { label: 'Platform revenue', value: formatCurrency(stats?.totalRevenue || 0), helper: 'Gross platform fees', icon: DollarSign },
  ]

  return (
    <div className="space-y-6">
      <div className="border-b border-white/10 pb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-semibold">Admin overview</h1>
          </div>
          <Button asChild className="gradient-primary w-full border-0 text-white sm:w-auto"><Link href="/admin/trainers"><ShieldCheck className="mr-2 h-4 w-4" />Review pending trainers</Link></Button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((item) => (
            <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300"><item.icon className="h-4 w-4 text-emerald-300" /> {item.label}</div>
              <div className="mt-2 text-3xl font-semibold text-white">{item.value}</div>
              <div className="mt-1 text-xs text-slate-400">{item.helper}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          { href: '/admin/trainers', title: 'Trainer approvals', detail: `${stats?.pendingTrainers || 0} waiting`, icon: UserCheck },
          { href: '/admin/bookings', title: 'Booking queue', detail: `${stats?.pendingBookings || 0} pending`, icon: Clock },
          { href: '/admin/payouts', title: 'Revenue view', detail: formatCurrency(stats?.totalRevenue || 0), icon: DollarSign },
          { href: '/admin/analytics', title: 'Analytics', detail: 'Platform activity', icon: Activity },
        ].map((item) => (
          <Link href={item.href} key={item.href}>
            <Card className="h-full border-white/10 bg-white/[0.04] text-white transition hover:bg-white/[0.08]">
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10"><item.icon className="h-5 w-5 text-emerald-300" /></div>
                  <div className="mt-4 font-semibold">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-400">{item.detail}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="border-white/10 bg-white/[0.04] text-white shadow-xl">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Recent bookings</CardTitle>
            <Link href="/admin/bookings"><Button variant="ghost" size="sm" className="text-slate-300 hover:bg-white/10 hover:text-white">View all <ArrowRight className="ml-1 h-3 w-3" /></Button></Link>
          </div>
        </CardHeader>
        <CardContent>
          {bookings.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/40 py-10 text-center text-slate-400">No bookings yet</div>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => (
                <div key={b.id} className="flex flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4 md:flex-row md:items-center">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm truncate text-white">{b.parentProfile.user.email.split('@')[0]}</span>
                      <span className="text-slate-500">→</span>
                      <span className="font-medium text-sm text-white">{b.trainerProfile.firstName} {b.trainerProfile.lastName}</span>
                      <Badge className={BOOKING_STATUS_COLORS[b.status] || ''}>{b.status}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-slate-300">{b.serviceOffering.title}</div>
                    <div className="mt-2 text-xs text-slate-400">{formatBookingDate(b.date)} at {b.startTime} ({b.timeZone || 'Time zone unconfirmed'})</div>
                  </div>
                  <div className="text-left md:text-right">
                    <div className="font-semibold text-white">{formatCurrency(b.totalAmountInCents)}</div>
                    <div className="text-xs text-slate-400">Live booking signal</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  )
}
