"use client"

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Calendar, Users, Heart, Star, Plus, Clock, Loader2, CreditCard, Sparkles, CheckCircle2, ArrowRight } from 'lucide-react'
import { formatCurrency, BOOKING_STATUS_COLORS } from '@/lib/utils'
import { useToast } from '@/components/ui/use-toast'

interface Booking {
  id: string
  date: string
  startTime: string
  endTime: string
  status: string
  totalAmountInCents: number
  notes: string | null
  payment?: { status: string } | null
  serviceOffering: { title: string; durationMinutes: number }
  trainerProfile: {
    firstName: string
    lastName: string
    stripeAccountId: string | null
    stripeOnboardingComplete: boolean
    sports: { sport: { name: string; icon: string | null } }[]
  }
  athleteProfile: { firstName: string; lastName: string }
  review: { id: string } | null
}

interface Athlete {
  id: string
  firstName: string
  lastName: string
  sports: { sport: { name: string } }[]
}

function isTrainerPaymentReady(booking: Booking) {
  return Boolean(booking.trainerProfile.stripeAccountId) && booking.trainerProfile.stripeOnboardingComplete
}

export default function ParentDashboard() {
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [startingCheckoutId, setStartingCheckoutId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/bookings').then(r => r.json()),
      fetch('/api/athletes').then(r => r.json()),
    ]).then(([bookingsData, athletesData]) => {
      setBookings(bookingsData.bookings || [])
      setAthletes(athletesData.athletes || [])
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const paymentState = searchParams.get('payment')
    if (paymentState === 'success') {
      toast({ title: 'Payment completed', description: 'Your booking payment was submitted successfully.' })
    }
    if (paymentState === 'cancelled') {
      toast({ title: 'Checkout cancelled', description: 'You can return and complete payment any time.', variant: 'destructive' })
    }
  }, [searchParams, toast])

  const handleCheckout = async (bookingId: string) => {
    setStartingCheckoutId(bookingId)
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Unable to start checkout', description: data.error || 'Please try again.', variant: 'destructive' })
        return
      }

      if (!data.checkoutUrl) {
        toast({ title: 'Unable to start checkout', description: 'Stripe did not return a checkout URL.', variant: 'destructive' })
        return
      }

      window.location.href = data.checkoutUrl
    } catch {
      toast({ title: 'Unable to start checkout', description: 'Something went wrong starting payment.', variant: 'destructive' })
    } finally {
      setStartingCheckoutId(null)
    }
  }

  const upcomingBookings = bookings.filter(b => ['PENDING', 'CONFIRMED'].includes(b.status))
  const pastBookings = bookings.filter(b => ['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(b.status))

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="container max-w-6xl py-8 md:py-10">
        <div className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_34%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)] md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Parent command center
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Manage athletes, bookings, and payments without the chaos.</h1>
              <p className="mt-3 text-sm leading-7 text-slate-300 md:text-base">The dashboard now reads like a premium family control panel with cleaner trust signals, faster payment cues, and calmer mobile spacing.</p>
            </div>
            <Link href="/browse"><Button className="gradient-primary w-full border-0 text-white sm:w-auto"><Users className="mr-2 h-4 w-4" />Find Trainers</Button></Link>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Upcoming sessions', value: upcomingBookings.length, icon: Calendar },
              { label: 'Athletes saved', value: athletes.length, icon: Users },
              { label: 'Reviews to leave', value: pastBookings.filter(b => b.status === 'COMPLETED' && !b.review).length, icon: Star },
              { label: 'Saved favorites', value: 0, icon: Heart },
            ].map((item) => (
              <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4 backdrop-blur">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300"><item.icon className="h-4 w-4 text-emerald-300" /> {item.label}</div>
                <div className="mt-2 text-3xl font-semibold text-white">{item.value}</div>
              </div>
            ))}
          </div>
        </div>

        <Card className="mt-6 border-white/10 bg-white/[0.04] text-white shadow-xl">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <h2 className="font-semibold">My Athletes</h2>
              <p className="mt-1 text-sm text-slate-400">Keep each athlete ready for faster booking.</p>
            </div>
            <Link href="/parent/athletes/new"><Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Plus className="mr-1 h-4 w-4" />Add Athlete</Button></Link>
          </CardHeader>
          <CardContent>
            {athletes.length === 0 ? (
              <div className="rounded-[1.5rem] border border-dashed border-white/10 bg-slate-950/45 py-10 text-center">
                <Users className="mx-auto mb-3 h-12 w-12 text-slate-500" />
                <h3 className="font-semibold text-white">No athletes yet</h3>
                <p className="mt-1 text-sm text-slate-400">Add your child&apos;s profile once so future booking takes minutes.</p>
                <Link href="/parent/athletes/new"><Button className="mt-4 gradient-primary border-0 text-white">Add Your First Athlete</Button></Link>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                {athletes.map(a => (
                  <div key={a.id} className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary font-semibold text-white">
                        {a.firstName[0]}{a.lastName[0]}
                      </div>
                      <div>
                        <div className="font-medium text-white">{a.firstName} {a.lastName}</div>
                        <div className="text-xs text-slate-400">{a.sports.map(s => s.sport.name).join(', ') || 'No sports yet'}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="upcoming" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-slate-900 p-2 sm:w-auto">
            <TabsTrigger value="upcoming">Upcoming ({upcomingBookings.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({pastBookings.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="upcoming" className="mt-4">
            {upcomingBookings.length === 0 ? (
              <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="py-10 text-center text-slate-400">No upcoming sessions. <Link href="/browse" className="text-emerald-300 hover:underline">Find a trainer</Link></CardContent></Card>
            ) : (
              <div className="space-y-3">
                {upcomingBookings.map(b => (
                  <Card key={b.id} className="border-white/10 bg-white/[0.04] text-white">
                    <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{b.trainerProfile.firstName} {b.trainerProfile.lastName[0]}.</span>
                          <Badge className={BOOKING_STATUS_COLORS[b.status] || ''}>{b.status}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-slate-300">{b.serviceOffering.title} • {b.athleteProfile.firstName} {b.athleteProfile.lastName}</div>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(b.date).toLocaleDateString()}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{b.startTime} – {b.endTime}</span>
                        </div>
                      </div>
                      <div className="md:text-right">
                        <div className="font-semibold text-white">{formatCurrency(b.totalAmountInCents)}</div>
                        {b.status === 'PENDING' && <div className="mt-1 text-xs text-slate-400">Awaiting trainer confirmation</div>}
                        {b.status === 'CONFIRMED' && b.payment?.status !== 'SUCCEEDED' && (
                          isTrainerPaymentReady(b) ? (
                            <Button size="sm" className="mt-2 gradient-primary border-0 text-white" onClick={() => handleCheckout(b.id)} disabled={startingCheckoutId === b.id}>
                              {startingCheckoutId === b.id ? <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Starting...</> : <><CreditCard className="mr-1 h-3 w-3" />Pay now</>}
                            </Button>
                          ) : (
                            <div className="mt-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium text-amber-200">
                              Trainer payment setup pending
                            </div>
                          )
                        )}
                        {b.status === 'CONFIRMED' && b.payment?.status !== 'SUCCEEDED' && !isTrainerPaymentReady(b) && (
                          <div className="mt-2 text-xs text-amber-200">
                            This trainer must finish Stripe setup before payment can be collected.
                          </div>
                        )}
                        {b.payment?.status === 'SUCCEEDED' && <div className="mt-1 text-xs font-medium text-emerald-300">Paid</div>}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="past" className="mt-4">
            {pastBookings.length === 0 ? (
              <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="py-10 text-center text-slate-400">No past sessions yet.</CardContent></Card>
            ) : (
              <div className="space-y-3">
                {pastBookings.map(b => (
                  <Card key={b.id} className="border-white/10 bg-white/[0.04] text-white">
                    <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{b.trainerProfile.firstName} {b.trainerProfile.lastName[0]}.</span>
                          <Badge className={BOOKING_STATUS_COLORS[b.status] || ''}>{b.status}</Badge>
                        </div>
                        <div className="mt-1 text-sm text-slate-300">{b.serviceOffering.title}</div>
                        <div className="mt-2 flex flex-wrap gap-4 text-xs text-slate-400">
                          <span>{new Date(b.date).toLocaleDateString()}</span>
                          <span>{formatCurrency(b.totalAmountInCents)}</span>
                        </div>
                      </div>
                      {b.status === 'COMPLETED' && !b.review && (
                        <Link href={`/review/${b.id}`}>
                          <Button size="sm" className="gradient-primary border-0 text-white"><Star className="mr-1 h-4 w-4" />Leave Review</Button>
                        </Link>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-6 rounded-[1.75rem] border border-white/10 bg-white/[0.04] p-5 text-sm text-slate-300">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Parent dashboard refinement complete</div>
              <p className="mt-2 max-w-2xl">Key actions, payment cues, and athlete management now share the same premium dark-shell language as browse, profiles, and booking.</p>
            </div>
            <Link href="/browse" className="inline-flex items-center text-emerald-300 hover:text-emerald-200">Browse trainers <ArrowRight className="ml-1 h-4 w-4" /></Link>
          </div>
        </div>
      </div>
    </div>
  )
}
