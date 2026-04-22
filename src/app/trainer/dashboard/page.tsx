"use client"

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Loader2,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
  XCircle,
} from 'lucide-react'
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

interface StripeConnectStatus {
  providerConfigured: boolean
  publishableKeyConfigured: boolean
  stripeAccountId: string | null
  stripeOnboardingComplete: boolean
  chargesEnabled: boolean | null
  payoutsEnabled: boolean | null
  providerError: string
  dashboardSupported: boolean
  onboardingSupported: boolean
}

export default function TrainerDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [stripeStatus, setStripeStatus] = useState<StripeConnectStatus | null>(null)
  const [stripeStatusLoading, setStripeStatusLoading] = useState(true)
  const [stripeStatusError, setStripeStatusError] = useState('')
  const [launchingStripe, setLaunchingStripe] = useState(false)

  const loadStripeStatus = useCallback(async () => {
    try {
      setStripeStatusLoading(true)
      setStripeStatusError('')

      const res = await fetch('/api/payments/connect', { cache: 'no-store' })
      const data = await res.json()

      if (!res.ok) {
        setStripeStatus(null)
        setStripeStatusError(data.error || 'Unable to load Stripe payout status right now.')
        return
      }

      setStripeStatus(data)
    } catch {
      setStripeStatus(null)
      setStripeStatusError('Unable to load Stripe payout status right now.')
    } finally {
      setStripeStatusLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/bookings')
      .then((r) => r.json())
      .then((data) => {
        setBookings(data.bookings || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    void loadStripeStatus()
  }, [loadStripeStatus])

  useEffect(() => {
    const stripeState = searchParams.get('stripe')
    if (!stripeState) return

    if (stripeState === 'complete') {
      toast({
        title: 'Back from Stripe',
        description: 'Refreshing your payout status now.',
      })
    }

    if (stripeState === 'refresh') {
      toast({
        title: 'Finish Stripe setup',
        description: 'There are still a few Stripe steps left before parents can pay you.',
        variant: 'destructive',
      })
    }

    void loadStripeStatus()
    router.replace('/trainer/dashboard')
  }, [searchParams, router, loadStripeStatus, toast])

  const handleAction = async (bookingId: string, action: string) => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const d = await res.json()
        toast({ title: 'Error', description: d.error, variant: 'destructive' })
        return
      }
      toast({ title: `Booking ${action === 'confirm' ? 'confirmed' : action === 'complete' ? 'completed' : 'updated'}` })
      setBookings((prev) =>
        prev.map((b) =>
          b.id === bookingId
            ? {
                ...b,
                status:
                  action === 'confirm'
                    ? 'CONFIRMED'
                    : action === 'complete'
                      ? 'COMPLETED'
                      : action === 'cancel'
                        ? 'CANCELLED'
                        : 'NO_SHOW',
              }
            : b,
        ),
      )
    } catch {
      toast({ title: 'Error', variant: 'destructive' })
    }
  }

  const handleStripeConnect = async () => {
    try {
      setLaunchingStripe(true)
      const res = await fetch('/api/payments/connect', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        toast({
          title: 'Stripe setup unavailable',
          description: data.error || 'Unable to open Stripe setup right now.',
          variant: 'destructive',
        })
        void loadStripeStatus()
        return
      }

      const redirectUrl = data.dashboardUrl || data.onboardingUrl
      if (!redirectUrl) {
        toast({
          title: 'Stripe setup unavailable',
          description: 'Trainr did not receive a Stripe redirect URL.',
          variant: 'destructive',
        })
        return
      }

      window.location.href = redirectUrl
    } catch {
      toast({
        title: 'Stripe setup unavailable',
        description: 'Unable to reach Stripe right now. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setLaunchingStripe(false)
    }
  }

  const pendingBookings = bookings.filter((b) => b.status === 'PENDING')
  const confirmedBookings = bookings.filter((b) => b.status === 'CONFIRMED')
  const completedBookings = bookings.filter((b) => b.status === 'COMPLETED')

  const totalEarnings = completedBookings.reduce((sum, b) => sum + b.trainerPayoutInCents, 0)
  const upcomingCount = pendingBookings.length + confirmedBookings.length

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  const tabItems = {
    pending: pendingBookings,
    confirmed: confirmedBookings,
    completed: completedBookings,
    all: bookings,
  }

  const stripeReady = Boolean(stripeStatus?.stripeOnboardingComplete)
  const stripeStarted = Boolean(stripeStatus?.stripeAccountId)

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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/trainer/profile?tab=payouts"><Button variant="outline" size="sm" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"><DollarSign className="mr-1 h-4 w-4" />Payouts</Button></Link>
              <Link href="/trainer/profile"><Button variant="outline" size="sm" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto"><Settings className="mr-1 h-4 w-4" />Edit Profile</Button></Link>
            </div>
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

        <Card className="mt-6 border-white/10 bg-white/[0.04] text-white">
          <CardContent className="p-5 md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <div className="inline-flex items-center gap-2 font-semibold text-white"><Wallet className="h-4 w-4 text-emerald-300" /> Stripe payout setup</div>
                <p className="mt-2 text-sm leading-6 text-slate-300">Parents cannot complete checkout until your Stripe payout setup is live. This gives trainers a self-serve path instead of leaving payment blocked.</p>

                <div className="mt-4 flex flex-wrap gap-2">
                  {stripeStatusLoading ? (
                    <Badge className="border border-white/10 bg-white/5 text-slate-200"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Checking Stripe</Badge>
                  ) : stripeReady ? (
                    <Badge className="border border-emerald-400/30 bg-emerald-400/10 text-emerald-100"><CheckCircle2 className="mr-1 h-3 w-3" />Payments ready</Badge>
                  ) : stripeStarted ? (
                    <Badge className="border border-amber-400/30 bg-amber-400/10 text-amber-100"><AlertTriangle className="mr-1 h-3 w-3" />Setup in progress</Badge>
                  ) : (
                    <Badge className="border border-rose-400/30 bg-rose-400/10 text-rose-100"><AlertTriangle className="mr-1 h-3 w-3" />Stripe not started</Badge>
                  )}

                  {!stripeStatusLoading && stripeStatus?.chargesEnabled != null && (
                    <Badge className={stripeStatus.chargesEnabled ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border border-amber-400/30 bg-amber-400/10 text-amber-100'}>
                      Charges {stripeStatus.chargesEnabled ? 'enabled' : 'pending'}
                    </Badge>
                  )}

                  {!stripeStatusLoading && stripeStatus?.payoutsEnabled != null && (
                    <Badge className={stripeStatus.payoutsEnabled ? 'border border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border border-amber-400/30 bg-amber-400/10 text-amber-100'}>
                      Payouts {stripeStatus.payoutsEnabled ? 'enabled' : 'pending'}
                    </Badge>
                  )}
                </div>

                {stripeStatusError && <p className="mt-3 text-sm text-rose-300">{stripeStatusError}</p>}
                {!stripeStatusError && stripeStatus && !stripeStatus.providerConfigured && (
                  <p className="mt-3 text-sm text-rose-300">Stripe is not configured on this runtime yet, so trainer onboarding cannot finish here until the env is repaired.</p>
                )}
                {!stripeStatusError && stripeStatus?.providerError && (
                  <p className="mt-3 text-sm text-amber-200">{stripeStatus.providerError}</p>
                )}
                {!stripeStatusError && stripeStatus?.providerConfigured && !stripeReady && (
                  <p className="mt-3 text-sm text-slate-300">Start or resume Stripe onboarding here, then come back. Once charges and payouts are enabled, parents can pay normally.</p>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:min-w-[240px]">
                <Button
                  className="gradient-primary border-0 text-white"
                  onClick={handleStripeConnect}
                  disabled={launchingStripe || stripeStatusLoading || !stripeStatus?.providerConfigured}
                >
                  {launchingStripe ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Opening Stripe...</>
                  ) : stripeReady ? (
                    <><Wallet className="mr-2 h-4 w-4" />Open Stripe dashboard</>
                  ) : stripeStarted ? (
                    <><ArrowRight className="mr-2 h-4 w-4" />Resume Stripe setup</>
                  ) : (
                    <><ArrowRight className="mr-2 h-4 w-4" />Start Stripe setup</>
                  )}
                </Button>
                <Link href="/trainer/profile">
                  <Button variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                    <Settings className="mr-2 h-4 w-4" />Review trainer profile
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="pending" className="mt-6">
          <TabsList className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-2 md:flex md:w-auto md:flex-wrap md:justify-start">
            <TabsTrigger value="pending">Pending ({pendingBookings.length})</TabsTrigger>
            <TabsTrigger value="confirmed">Confirmed ({confirmedBookings.length})</TabsTrigger>
            <TabsTrigger value="completed">Completed ({completedBookings.length})</TabsTrigger>
            <TabsTrigger value="all">All ({bookings.length})</TabsTrigger>
          </TabsList>

          {(['pending', 'confirmed', 'completed', 'all'] as const).map((tab) => (
            <TabsContent key={tab} value={tab} className="mt-4">
              <div className="space-y-3">
                {tabItems[tab].length === 0 ? (
                  <Card className="border-white/10 bg-white/[0.04] text-white"><CardContent className="py-10 text-center text-slate-400">No bookings in this view.</CardContent></Card>
                ) : (
                  tabItems[tab].map((b) => (
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
