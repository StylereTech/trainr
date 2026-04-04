"use client"

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  PlusCircle,
  ShieldCheck,
  Sparkles,
  Star,
  CheckCircle2,
  User,
  X,
} from 'lucide-react'
import { formatCurrency, SPORTS } from '@/lib/utils'
import { formatDateForInput, generateAvailableTimeSlots, parseDateInputAsLocalDate } from '@/lib/trainer'
import { getSportVisual, isLiveTrainrImage, TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'

interface TrainerData {
  id: string
  firstName: string
  lastName: string
  slug: string
  headline: string | null
  avgRating: number
  totalReviews: number
  city: string | null
  state: string | null
  locationType: string
  sports: { sport: { name: string; icon: string | null } }[]
  serviceOfferings: { id: string; title: string; description: string | null; durationMinutes: number; priceInCents: number; type: string }[]
  availabilitySlots: { dayOfWeek: number | null; startTime: string; endTime: string; isRecurring: boolean }[]
}

interface Athlete {
  id: string
  firstName: string
  lastName: string
  sports: { sport: { name: string } }[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function BookingPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const slug = params.slug as string

  const [trainer, setTrainer] = useState<TrainerData | null>(null)
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(true)
  const [showAddAthlete, setShowAddAthlete] = useState(false)
  const [addingAthlete, setAddingAthlete] = useState(false)
  const [newAthlete, setNewAthlete] = useState({ firstName: '', lastName: '', dateOfBirth: '', sports: [] as string[] })

  const [selectedService, setSelectedService] = useState('')
  const [selectedAthlete, setSelectedAthlete] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [couponCode, setCouponCode] = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/trainers/${slug}`).then((r) => r.json()),
      fetch('/api/athletes').then((r) => {
        if (r.status === 401) {
          setIsAuthenticated(false)
          return { athletes: [] }
        }
        return r.json()
      }),
    ])
      .then(([trainerData, athletesData]) => {
        setTrainer(trainerData)
        setAthletes(athletesData.athletes || [])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [slug])

  const service = trainer?.serviceOfferings.find((s) => s.id === selectedService)
  const athlete = athletes.find((a) => a.id === selectedAthlete)

  const availableTimes = trainer && selectedDate
    ? generateAvailableTimeSlots(trainer.availabilitySlots, selectedDate, service?.durationMinutes || 60)
    : []

  const availableDates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i + 1)
    return formatDateForInput(d)
  })

  const sportSlug = useMemo(() => {
    const primarySport = trainer?.sports[0]?.sport.name?.toLowerCase()
    return SPORTS.find((sport) => sport.name.toLowerCase() === primarySport)?.slug || 'general'
  }, [trainer])

  const visual = useMemo(() => {
    if (!trainer) return TRAINR_IMAGE_CATALOG.baseball.hero
    return getSportVisual(sportSlug)
  }, [sportSlug, trainer])

  const selectedDateLabel = selectedDate
    ? parseDateInputAsLocalDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Choose a date'

  const completedSteps = [selectedService, selectedAthlete, selectedDate && selectedTime].filter(Boolean).length

  const handleAddAthlete = async () => {
    if (!newAthlete.firstName || !newAthlete.lastName || !newAthlete.dateOfBirth || newAthlete.sports.length === 0) {
      toast({ title: 'Missing fields', description: 'Fill in name, date of birth, and select at least one sport.', variant: 'destructive' })
      return
    }
    setAddingAthlete(true)
    try {
      const res = await fetch('/api/athletes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newAthlete, skillLevel: 'BEGINNER' }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: data.error || 'Could not add athlete', variant: 'destructive' })
        return
      }
      const created: Athlete = { id: data.id, firstName: data.firstName, lastName: data.lastName, sports: data.sports || [] }
      setAthletes((prev) => [...prev, created])
      setSelectedAthlete(created.id)
      setShowAddAthlete(false)
      setNewAthlete({ firstName: '', lastName: '', dateOfBirth: '', sports: [] })
      toast({ title: 'Athlete added!', description: `${created.firstName} is ready for booking.` })
    } catch {
      toast({ title: 'Error', description: 'Something went wrong', variant: 'destructive' })
    } finally {
      setAddingAthlete(false)
    }
  }

  const toggleNewAthleteSport = (slug: string) => {
    setNewAthlete((prev) => ({
      ...prev,
      sports: prev.sports.includes(slug) ? prev.sports.filter((s) => s !== slug) : [...prev.sports, slug],
    }))
  }

  const handleSubmit = async () => {
    if (!selectedService || !selectedAthlete || !selectedDate || !selectedTime) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields', variant: 'destructive' })
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceOfferingId: selectedService,
          athleteProfileId: selectedAthlete,
          date: selectedDate,
          startTime: selectedTime,
          notes,
          couponCode: couponCode || undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
        return
      }

      // Attempt immediate checkout redirect (pay-to-book)
      try {
        const checkoutRes = await fetch('/api/payments/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookingId: data.id }),
        })
        const checkoutData = await checkoutRes.json()
        if (checkoutRes.ok && checkoutData.checkoutUrl) {
          window.location.href = checkoutData.checkoutUrl
          return
        }
      } catch {
        // Stripe not configured or checkout failed — fall back to dashboard
      }

      toast({ title: 'Booking Created!', description: 'Complete payment from your dashboard to confirm.' })
      router.push('/parent/dashboard')
    } catch {
      toast({ title: 'Error', description: 'Something went wrong', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (!trainer) {
    return (
      <div className="container py-20 text-center">
        <h2 className="mb-4 text-2xl font-bold">Trainer Not Found</h2>
        <Link href="/browse"><Button>Browse Trainers</Button></Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_38%),linear-gradient(180deg,_#04130b_0%,_#08131f_100%)]">
        <div className="container py-8 md:py-10">
          <Link href={`/trainers/${trainer.slug}`} className="text-sm text-slate-300 transition hover:text-white">
            ← Back to {trainer.firstName}&apos;s profile
          </Link>

          <div className="mt-4 grid gap-6 lg:grid-cols-[1.15fr_.85fr] lg:items-stretch">
            <div className="max-w-3xl">
              <Badge className="mb-4 border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Premium booking flow
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight md:text-5xl">Book a session with {trainer.firstName} {trainer.lastName[0]}.</h1>
              <p className="mt-4 max-w-2xl text-sm text-slate-300 md:text-base">
                Review the offer, match the right athlete, and request a session with clear pricing, trusted guardrails, and zero checkout confusion.
              </p>
              <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300 md:text-sm">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{trainer.totalReviews > 0 ? `${trainer.totalReviews} verified reviews` : 'New trainer profile'}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">{trainer.locationType === 'VIRTUAL' ? 'Virtual-ready coaching' : trainer.locationType === 'BOTH' ? 'In-person + virtual' : 'In-person coaching'}</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">No charge until confirmation</span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Trainer', value: `${trainer.firstName} ${trainer.lastName[0]}.`, icon: User },
                  { label: 'Rating', value: trainer.totalReviews > 0 ? `${trainer.avgRating.toFixed(1)} / 5` : 'New profile', icon: Star },
                  { label: 'Progress', value: `${completedSteps}/3 core steps done`, icon: CheckCircle2 },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-300">
                      <item.icon className="h-4 w-4" /> {item.label}
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 shadow-2xl">
              {isLiveTrainrImage(visual) ? (
                <Image src={visual.src} alt={visual.alt} width={1200} height={1200} className="h-[260px] w-full object-cover md:h-[320px]" priority />
              ) : (
                <div className="flex h-[260px] items-end bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.22),_transparent_35%),linear-gradient(160deg,_rgba(255,255,255,0.1),_rgba(255,255,255,0.03))] p-6 md:h-[320px]">
                  <div>
                    <Badge className="border-white/15 bg-white/10 text-white hover:bg-white/10">Media placeholder</Badge>
                    <h2 className="mt-4 text-2xl font-semibold">{visual.label}</h2>
                    <p className="mt-2 max-w-md text-sm text-slate-300">{visual.status}. Designed for a premium {visual.tone} slot once more sport imagery lands.</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 backdrop-blur">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                    <ShieldCheck className="h-4 w-4 text-emerald-300" /> Booking designed for parent confidence
                  </div>
                  <p className="mt-2 text-sm text-slate-300">Athlete context, clear next steps, and transparent payment timing all stay visible on one page.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container py-6 md:py-8">
        <div className="mb-5 lg:hidden">
          <button
            type="button"
            onClick={() => setSummaryOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left"
          >
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Booking summary</div>
              <div className="mt-1 text-sm font-semibold text-white">{service ? `${service.title} • ${formatCurrency(service.priceInCents)}` : 'Select a service to start'}</div>
            </div>
            {summaryOpen ? <ChevronUp className="h-5 w-5 text-slate-300" /> : <ChevronDown className="h-5 w-5 text-slate-300" />}
          </button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_.55fr] xl:grid-cols-[1.2fr_.5fr]">
          <div className="space-y-6">
            <Card className="border-white/10 bg-white text-slate-950 shadow-xl">
              <CardHeader>
                <h2 className="flex items-center gap-2 font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full gradient-primary text-xs text-white">1</span> Choose the right service</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                {trainer.serviceOfferings.map((s) => {
                  const active = selectedService === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelectedService(s.id)}
                      className={`w-full rounded-2xl border p-4 text-left transition md:p-5 ${
                        active ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="font-semibold text-slate-950">{s.title}</div>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                            <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200"><Clock className="h-3 w-3" /> {s.durationMinutes} min</span>
                            <Badge variant="secondary" className="bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-white">
                              {s.type === 'INDIVIDUAL' ? '1-on-1' : s.type === 'GROUP' ? 'Group' : 'Virtual'}
                            </Badge>
                          </div>
                          {s.description && <p className="mt-3 text-sm leading-6 text-slate-600">{s.description}</p>}
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Starting price</div>
                          <div className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(s.priceInCents)}</div>
                        </div>
                      </div>
                    </button>
                  )
                })}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white text-slate-950 shadow-xl">
              <CardHeader>
                <h2 className="flex items-center gap-2 font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full gradient-primary text-xs text-white">2</span> Match the athlete</h2>
              </CardHeader>
              <CardContent>
                {!isAuthenticated ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center">
                    <p className="mb-4 text-sm text-slate-600">Sign in or create an account to book a session.</p>
                    <div className="flex items-center justify-center gap-3">
                      <Link href={`/auth/signin?callbackUrl=/book/${slug}`}><Button size="sm">Sign In</Button></Link>
                      <Link href={`/auth/signup?callbackUrl=/book/${slug}`}><Button variant="outline" size="sm">Sign Up</Button></Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {athletes.length > 0 && (
                      <>
                        <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
                          <SelectTrigger className="h-12"><SelectValue placeholder="Choose your athlete" /></SelectTrigger>
                          <SelectContent>
                            {athletes.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.firstName} {a.lastName} {a.sports.length > 0 ? `(${a.sports.map((s) => s.sport.name).join(', ')})` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {athlete && (
                          <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-100">
                            <div className="font-semibold text-slate-900">Selected athlete</div>
                            <div className="mt-1">{athlete.firstName} {athlete.lastName}</div>
                            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">Sports</div>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {athlete.sports.length > 0 ? athlete.sports.map((sport) => (
                                <span key={sport.sport.name} className="rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-slate-200">{sport.sport.name}</span>
                              )) : <span className="text-xs text-slate-500">No sports added yet</span>}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {!showAddAthlete ? (
                      <button
                        type="button"
                        onClick={() => setShowAddAthlete(true)}
                        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-4 text-sm font-medium text-slate-600 transition hover:border-emerald-400 hover:bg-emerald-50/50 hover:text-emerald-700"
                      >
                        <PlusCircle className="h-4 w-4" /> {athletes.length > 0 ? 'Add another athlete' : 'Add your athlete to continue'}
                      </button>
                    ) : (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 ring-1 ring-emerald-100">
                        <div className="mb-4 flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-900">Quick add athlete</h3>
                          <button type="button" onClick={() => setShowAddAthlete(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"><X className="h-4 w-4" /></button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs text-slate-700">First name</Label>
                            <Input value={newAthlete.firstName} onChange={(e) => setNewAthlete({ ...newAthlete, firstName: e.target.value })} placeholder="First name" className="mt-1 h-10" />
                          </div>
                          <div>
                            <Label className="text-xs text-slate-700">Last name</Label>
                            <Input value={newAthlete.lastName} onChange={(e) => setNewAthlete({ ...newAthlete, lastName: e.target.value })} placeholder="Last name" className="mt-1 h-10" />
                          </div>
                        </div>
                        <div className="mt-3">
                          <Label className="text-xs text-slate-700">Date of birth</Label>
                          <Input type="date" value={newAthlete.dateOfBirth} onChange={(e) => setNewAthlete({ ...newAthlete, dateOfBirth: e.target.value })} className="mt-1 h-10 w-full sm:w-48" />
                        </div>
                        <div className="mt-3">
                          <Label className="text-xs text-slate-700">Sport(s)</Label>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {SPORTS.map((sport) => {
                              const active = newAthlete.sports.includes(sport.slug)
                              return (
                                <button
                                  key={sport.slug}
                                  type="button"
                                  onClick={() => toggleNewAthleteSport(sport.slug)}
                                  className={`rounded-full border px-3 py-1.5 text-xs transition ${active ? 'border-emerald-500 bg-emerald-100 font-medium text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                                >
                                  {sport.icon} {sport.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="mt-4 gradient-primary border-0 text-white"
                          disabled={addingAthlete}
                          onClick={handleAddAthlete}
                        >
                          {addingAthlete ? <><Loader2 className="mr-2 h-3 w-3 animate-spin" /> Saving...</> : 'Save & select'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white text-slate-950 shadow-xl">
              <CardHeader>
                <h2 className="flex items-center gap-2 font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full gradient-primary text-xs text-white">3</span> Lock in date and time</h2>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <Label className="text-sm font-medium text-slate-900">Choose a date</Label>
                  <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-7">
                    {availableDates.map((date) => {
                      const d = parseDateInputAsLocalDate(date)
                      const isSelected = selectedDate === date
                      return (
                        <button
                          key={date}
                          onClick={() => { setSelectedDate(date); setSelectedTime('') }}
                          className={`rounded-2xl border p-2.5 text-center transition ${
                            isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className={`text-[11px] uppercase tracking-[0.12em] ${isSelected ? 'text-white/80' : 'text-slate-500'}`}>{DAY_NAMES[d.getDay()]}</div>
                          <div className="mt-1 text-lg font-semibold">{d.getDate()}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-slate-900">Choose a time</Label>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {selectedDate ? availableTimes.length > 0 ? availableTimes.map((time) => {
                      const isSelected = selectedTime === time
                      return (
                        <button
                          key={time}
                          onClick={() => setSelectedTime(time)}
                          className={`rounded-2xl border px-3 py-3 text-sm transition ${
                            isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {time}
                        </button>
                      )
                    }) : (
                      <p className="col-span-full rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 ring-1 ring-slate-100">No available times for this date.</p>
                    ) : (
                      <p className="col-span-full rounded-2xl bg-slate-50 px-4 py-4 text-sm text-slate-600 ring-1 ring-slate-100">Select a date first to see open time slots.</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-white/10 bg-white text-slate-950 shadow-xl">
              <CardHeader>
                <h2 className="flex items-center gap-2 font-semibold"><span className="flex h-7 w-7 items-center justify-center rounded-full gradient-primary text-xs text-white">4</span> Add session context</h2>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Label htmlFor="notes">Notes for the trainer</Label>
                  <Textarea
                    id="notes"
                    placeholder="Goals, injuries, preferred drills, confidence areas, or anything the trainer should know before session day."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="mt-2 min-h-[140px]"
                  />
                </div>
                <div className="md:col-span-2 lg:col-span-1">
                  <Label htmlFor="coupon">Promo code</Label>
                  <Input id="coupon" placeholder="Enter code" value={couponCode} onChange={(e) => setCouponCode(e.target.value)} className="mt-2 h-12" />
                </div>
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-100 md:col-span-2 lg:col-span-1">
                  <div className="font-semibold text-slate-900">Helpful note ideas</div>
                  <ul className="mt-2 space-y-2">
                    <li>• Current skill level and age group</li>
                    <li>• Recent injuries or movement limitations</li>
                    <li>• Session goals: confidence, mechanics, conditioning</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className={`${summaryOpen ? 'block' : 'hidden'} lg:block`}>
            <Card className="overflow-hidden border-white/10 bg-white text-slate-950 shadow-[0_24px_80px_rgba(0,0,0,0.32)] lg:sticky lg:top-20">
              <div className="bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.24),_transparent_42%),linear-gradient(180deg,_#04130b_0%,_#08131f_100%)] px-6 py-5 text-white">
                <div className="flex items-center gap-2 text-sm font-medium text-white/90"><Sparkles className="h-4 w-4" /> Booking summary</div>
                <h3 className="mt-1 text-2xl font-semibold">Everything in one place</h3>
                <p className="mt-2 text-sm text-white/80">Review session details, parent-facing protections, and the exact next step before you request.</p>
              </div>
              <CardContent className="space-y-5 p-6">
                {service ? (
                  <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Selected service</div>
                        <div className="mt-1 font-semibold text-slate-950">{service.title}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200"><Clock className="h-3 w-3" /> {service.durationMinutes} min</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 ring-1 ring-slate-200"><User className="h-3 w-3" /> {service.type === 'INDIVIDUAL' ? '1-on-1 session' : service.type === 'GROUP' ? 'Group session' : 'Virtual session'}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Total</div>
                        <div className="text-2xl font-bold text-emerald-700">{formatCurrency(service.priceInCents)}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">Choose a service to reveal pricing, duration, and the session format.</div>
                )}

                <div className="space-y-3 rounded-2xl border border-slate-200 p-4 text-sm text-slate-700">
                  <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-500" /> {selectedDateLabel}</div>
                  <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-500" /> {selectedTime || 'Choose a time'}</div>
                  <div className="flex items-center gap-2"><User className="h-4 w-4 text-slate-500" /> {athlete ? `${athlete.firstName} ${athlete.lastName}` : 'Choose an athlete'}</div>
                  <div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-slate-500" /> {trainer.city && trainer.state ? `${trainer.city}, ${trainer.state}` : trainer.locationType === 'VIRTUAL' ? 'Virtual coaching' : 'Location shared after confirmation'}</div>
                </div>

                <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
                  <div className="font-semibold">What happens next</div>
                  <div className="mt-3 space-y-2">
                    <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> Pay securely through Stripe to lock in your session.</div>
                    <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> Trainer is notified instantly and confirms the details.</div>
                    <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0" /> Messaging opens for goals, logistics, and follow-up.</div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                  <div className="flex items-center gap-2 font-semibold text-slate-950"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Why parents trust Trainr</div>
                  <p className="mt-2">Verified profiles, transparent pricing, and cleaner communication make the path from discovery to session day feel safer and easier.</p>
                </div>

                <Button
                  className="w-full gradient-primary border-0 text-white"
                  size="lg"
                  disabled={!selectedService || !selectedAthlete || !selectedDate || !selectedTime || submitting}
                  onClick={handleSubmit}
                >
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : <><CreditCard className="mr-2 h-4 w-4" />Book &amp; Pay</>}
                </Button>
                <p className="text-center text-xs text-slate-500">You&apos;ll be taken to secure checkout to confirm your session.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
