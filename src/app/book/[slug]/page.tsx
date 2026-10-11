"use client"

import { useEffect, useRef, useState } from 'react'
import { AthleteEditor } from '@/components/shared/AthleteEditor'
import { bookingTrainerSchema } from '@/lib/public-trainer-schema'
import { requestCheckout } from '@/lib/checkout-client'
import { useBookingQuote } from '@/lib/use-booking-quote'
import { z } from 'zod'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/use-toast'
import {
  Calendar,
  ArrowLeft,
  Clock,
  CreditCard,
  Loader2,
  MapPin,
  PlusCircle,
  RefreshCw,
  CheckCircle2,
  User,
  X,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { generateAvailableTimeSlots, parseDateInputAsLocalDate } from '@/lib/trainer'
import { bookingDates, PAID_BOOKING_LEAD_MS, resolveBookingTime } from '@/lib/booking-time'

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
  timeZone: string | null
  sports: { sport: { name: string; icon: string | null } }[]
  serviceOfferings: { id: string; title: string; description: string | null; durationMinutes: number; priceInCents: number; type: string }[]
  availabilitySlots: { dayOfWeek: number | null; startTime: string; endTime: string; isRecurring: boolean; isAvailable: boolean; specificDate: string | null }[]
}

interface Athlete {
  id: string
  firstName: string
  lastName: string
  sports: { sport: { name: string } }[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const bookingAthletesSchema = z.object({ athletes: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), sports: z.array(z.object({ sport: z.object({ name: z.string() }) })) })) })
const savedBookingSchema = z.object({ id: z.string().min(1), status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'RESCHEDULED']), totalAmountInCents: z.number().int().nonnegative() })

export default function BookingPage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const slug = params.slug as string

  const [trainer, setTrainer] = useState<TrainerData | null>(null)
  const [athletes, setAthletes] = useState<Athlete[]>([])
  const [loading, setLoading] = useState(true)
  const [trainerError, setTrainerError] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [bookingUncertain, setBookingUncertain] = useState(false)
  const [bookingError, setBookingError] = useState('')
  const [bookingReviewRequired, setBookingReviewRequired] = useState(false)
  const bookingInFlight = useRef(false)
  const bookingRequest = useRef<string | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(true)
  const [showAddAthlete, setShowAddAthlete] = useState(false)
  const [athleteSavePending, setAthleteSavePending] = useState(false)
  const [athleteError, setAthleteError] = useState('')
  const [loadAttempt, setLoadAttempt] = useState(0)

  const [selectedService, setSelectedService] = useState('')
  const [selectedAthlete, setSelectedAthlete] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')
  const [notes, setNotes] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const pricing = useBookingQuote(selectedService, couponCode, Boolean(trainer && isAuthenticated))
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    setLoading(true)
    setTrainer(null)
    setTrainerError(false)
    setAthleteError('')
    Promise.all([
      fetch(`/api/trainers/${encodeURIComponent(slug)}`, { signal: controller.signal }).then(async (r) => {
        if (r.status === 404) return null
        if (!r.ok) throw new Error('Trainer unavailable')
        return bookingTrainerSchema.parse(await r.json())
      }).catch(() => {
        if (active) setTrainerError(true)
        return null
      }),
      fetch('/api/athletes', { cache: 'no-store', signal: controller.signal }).then(async (r) => {
        if (r.status === 401) {
          if (active) setIsAuthenticated(false)
          return { athletes: [] }
        }
        if (!r.ok) throw new Error(r.status === 403 ? 'A parent account is required to book.' : 'Athletes could not be loaded. Please retry.')
        if (active) setIsAuthenticated(true)
        return bookingAthletesSchema.parse(await r.json())
      }).catch(error => {
        if (active) setAthleteError(error instanceof z.ZodError ? 'Athletes could not be loaded. Please retry.' : error.message || 'Athletes could not be loaded. Please retry.')
        return { athletes: [] }
      }),
    ])
      .then(([trainerData, athletesData]) => {
        if (!active) return
        setTrainer(trainerData)
        setAthletes(athletesData.athletes)
      })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false) })
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [slug, loadAttempt])

  const service = trainer?.serviceOfferings.find((s) => s.id === selectedService)
  const athlete = athletes.find((a) => a.id === selectedAthlete)

  const availableTimes = trainer && selectedDate
    ? generateAvailableTimeSlots(trainer.availabilitySlots, selectedDate, service?.durationMinutes || 60).filter(time => {
      try { return resolveBookingTime(selectedDate, time, service?.durationMinutes || 60, trainer.timeZone).startsAt.getTime() > now + PAID_BOOKING_LEAD_MS }
      catch { return false }
    })
    : []

  const availableDates = bookingDates(trainer?.timeZone, now)

  const selectedDateLabel = selectedDate
    ? parseDateInputAsLocalDate(selectedDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Choose a date'

  const handleSubmit = async () => {
    if (bookingInFlight.current || bookingReviewRequired) return
    if (!selectedService || !selectedAthlete || !selectedDate || !selectedTime) {
      toast({ title: 'Missing fields', description: 'Please fill in all required fields', variant: 'destructive' })
      return
    }
    if (!bookingRequest.current && !availableTimes.includes(selectedTime)) {
      setSelectedTime('')
      toast({ title: 'Choose another time', description: 'The selected time is no longer available for checkout.', variant: 'destructive' })
      return
    }
    if (!bookingRequest.current && !pricing.quote) {
      setBookingError('Confirm the current price before booking.')
      return
    }

    bookingInFlight.current = true
    setSubmitting(true)
    setBookingError('')
    try {
      bookingRequest.current ??= JSON.stringify({ requestId: crypto.randomUUID(), serviceOfferingId: selectedService, athleteProfileId: selectedAthlete,
        date: selectedDate, startTime: selectedTime, timeZone: trainer?.timeZone, notes, couponCode: couponCode || undefined,
        expectedTotalInCents: pricing.quote!.totalAmountInCents })
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: bookingRequest.current,
        signal: AbortSignal.timeout(15000),
      })

      const data = await res.json()
      if (!res.ok) {
        const message = typeof data.error === 'string' ? data.error : 'Booking could not be confirmed.'
        setBookingError(message)
        if (res.status === 409 && data.code === 'PRICE_CHANGED') {
          bookingRequest.current = null
          setBookingUncertain(false)
          pricing.refresh()
        }
        else if (res.status === 400) { bookingRequest.current = null; setBookingUncertain(false); pricing.refresh() }
        else if ([401, 403, 404, 409].includes(res.status)) setBookingReviewRequired(true)
        else setBookingUncertain(true)
        return
      }

      const saved = savedBookingSchema.parse(data)
      if (!['PENDING', 'CONFIRMED'].includes(saved.status)) {
        toast({ title: 'Booking recovered', description: 'Review the current booking status on your dashboard.' })
        router.push('/parent/dashboard')
        return
      }

      if (data.status === 'CONFIRMED' && data.totalAmountInCents === 0) {
        toast({ title: 'Booking confirmed', description: 'No payment is due.' })
        router.push('/parent/dashboard')
        return
      }

      try {
        window.location.href = await requestCheckout(saved.id)
        return
      } catch (error) {
        toast({ title: 'Check booking payment', description: error instanceof Error ? error.message : 'Your booking has been saved. Check its payment status before trying again.', variant: 'destructive' })
      }

      router.push('/parent/dashboard')
    } catch {
      setBookingUncertain(true)
      setBookingError('Booking could not be confirmed. Retry the same reservation or check your dashboard before starting another.')
    } finally {
      bookingInFlight.current = false
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
  }

  if (trainerError) {
    return <div className="container py-20 text-center" role="alert">
      <h1 className="mb-2 text-2xl font-bold">Trainer profile unavailable</h1>
      <p className="mb-4 text-muted-foreground">We couldn&apos;t load this trainer. Please try again before booking.</p>
      <Button onClick={() => setLoadAttempt(value => value + 1)}>Retry profile</Button>
    </div>
  }

  if (!trainer) {
    return (
      <div className="container py-20 text-center">
        <h2 className="mb-4 text-2xl font-bold">Trainer Not Found</h2>
        <Button asChild><Link href="/browse">Browse Trainers</Link></Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white text-zinc-900" style={{ letterSpacing: 0 }}>
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 border-b border-zinc-200 pb-6">
          <Link href={'/trainers/' + trainer.slug} className="inline-flex max-w-full items-start gap-2 text-sm text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline">
            <ArrowLeft className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><span className="min-w-0 break-words">Back to {trainer.firstName}&apos;s profile</span>
          </Link>
          <h1 className="mt-4 break-words text-2xl font-semibold sm:text-3xl">Book a session with {trainer.firstName} {trainer.lastName[0]}.</h1>
          <p className="mt-2 flex items-start gap-2 text-sm text-zinc-600">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{trainer.locationType === 'VIRTUAL' ? 'Virtual coaching' : trainer.city && trainer.state ? trainer.city + ', ' + trainer.state : 'Location shared after confirmation'}</span>
          </p>
        </header>

        {trainer.serviceOfferings.length === 0 ? (
          <section className="py-8">
            <h2 className="text-lg font-semibold">No sessions available to book.</h2>
            <Button asChild variant="outline" className="mt-4 border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"><Link href="/browse">Browse Trainers</Link></Button>
          </section>
        ) : (
          <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
            <fieldset disabled={submitting || bookingUncertain || bookingReviewRequired} className="min-w-0 space-y-6">
              <legend className="sr-only">Session details</legend>
              <section aria-labelledby="service-heading" className="border-b border-zinc-200 pb-6">
                <h2 id="service-heading" className="mb-3 text-lg font-semibold">1. Choose a service</h2>
                <div role="group" aria-labelledby="service-heading" className="space-y-3">
                  {trainer.serviceOfferings.map((s) => {
                    const active = selectedService === s.id
                    return (
                      <button
                        type="button"
                        key={s.id}
                        aria-pressed={active}
                        onClick={() => setSelectedService(s.id)}
                        className={'w-full rounded-lg border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ' +
                          (active ? 'border-emerald-700 bg-emerald-50' : 'border-zinc-300 bg-white hover:border-zinc-500')}
                      >
                        <span className="flex min-w-0 items-start gap-3">
                          <CheckCircle2 aria-hidden="true" className={'mt-0.5 h-5 w-5 shrink-0 ' + (active ? 'text-emerald-700' : 'text-zinc-300')} />
                          <span className="min-w-0 flex-1">
                            <span className="block break-words font-semibold">{s.title}</span>
                            <span className="mt-1 block text-sm text-zinc-600">{s.durationMinutes} min · {s.type === 'INDIVIDUAL' ? '1-on-1' : s.type === 'GROUP' ? 'Group' : 'Virtual'}</span>
                            {s.description && <span className="mt-2 block break-words text-sm text-zinc-600">{s.description}</span>}
                            <span className="mt-2 block text-lg font-semibold text-emerald-800">{formatCurrency(s.id === selectedService && pricing.quote ? pricing.quote.subtotalInCents : s.priceInCents)}</span>
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section aria-labelledby="athlete-heading" className="border-b border-zinc-200 pb-6">
                <h2 id="athlete-heading" className="mb-3 text-lg font-semibold">2. Choose an athlete</h2>
                {athleteError ? (
                  <div role="alert" className="space-y-3 text-sm"><p>{athleteError}</p><Button variant="outline" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900" onClick={() => setLoadAttempt(value => value + 1)}>Retry athletes</Button></div>
                ) : !isAuthenticated ? (
                  <div>
                    <p className="mb-3 text-sm text-zinc-600">Sign in or create an account to book a session.</p>
                    <div className="flex flex-wrap gap-3">
                      <Button asChild size="sm" className="bg-emerald-700 text-white hover:bg-emerald-800"><Link href={'/auth/signin?callbackUrl=/book/' + slug}>Sign In</Link></Button>
                      <Button asChild variant="outline" size="sm" className="border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"><Link href={'/auth/signup?callbackUrl=/book/' + slug}>Sign Up</Link></Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {athletes.length > 0 && (
                      <div>
                        <Label htmlFor="booking-athlete" className="text-zinc-700">Athlete</Label>
                        <Select value={selectedAthlete} onValueChange={setSelectedAthlete}>
                          <SelectTrigger id="booking-athlete" className="mt-2 h-11 min-w-0 border-zinc-300 bg-white text-zinc-900 disabled:bg-slate-100 disabled:text-slate-950 disabled:opacity-100"><SelectValue placeholder="Choose your athlete" /></SelectTrigger>
                          <SelectContent>
                            {athletes.map((a) => (
                              <SelectItem key={a.id} value={a.id}>{a.firstName} {a.lastName}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {!showAddAthlete ? (
                      <button type="button" onClick={() => setShowAddAthlete(true)} className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-emerald-800 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700">
                        <PlusCircle className="h-4 w-4 shrink-0" aria-hidden="true" /> {athletes.length > 0 ? 'Add another athlete' : 'Add your athlete to continue'}
                      </button>
                    ) : (
                      <div className="border-t border-zinc-200 pt-4">
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold">Quick add athlete</h3>
                          <button type="button" aria-label="Close athlete form" title="Close athlete form" disabled={athleteSavePending} onClick={() => setShowAddAthlete(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
                        </div>
                        <AthleteEditor onPendingChange={setAthleteSavePending} onSaved={created => { setAthletes(previous => [...previous.filter(item => item.id !== created.id), created]); setSelectedAthlete(created.id); setShowAddAthlete(false); setAthleteSavePending(false) }} />
                      </div>
                    )}
                  </div>
                )}
              </section>

              <section aria-labelledby="schedule-heading" className="border-b border-zinc-200 pb-6">
                <h2 id="schedule-heading" className="text-lg font-semibold">3. Choose a date and time</h2>
                <p className="mt-1 break-words text-sm text-zinc-600">{trainer.timeZone ? 'Session time zone: ' + trainer.timeZone.replaceAll('_', ' ') : 'Booking unavailable: trainer time zone is not set.'}</p>
                <div className="mt-4">
                  <h3 id="date-heading" className="text-sm font-medium">Choose a date</h3>
                  {availableDates.length > 0 && <p className="mt-1 text-sm text-zinc-600">{parseDateInputAsLocalDate(availableDates[0]).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {parseDateInputAsLocalDate(availableDates[availableDates.length - 1]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                  <div role="group" aria-labelledby="date-heading" className="mt-3 grid grid-cols-7 gap-1 sm:gap-2">
                    {availableDates.map((date) => {
                      const d = parseDateInputAsLocalDate(date)
                      const isSelected = selectedDate === date
                      return (
                        <button type="button" key={date} aria-pressed={isSelected} title={d.toLocaleDateString('en-US', { dateStyle: 'full' })}
                          onClick={() => { setSelectedDate(date); setSelectedTime('') }}
                          className={'flex min-h-14 min-w-0 flex-col items-center justify-center rounded-md border py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ' +
                            (isSelected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-zinc-300 hover:bg-zinc-50')}>
                          <span className="text-[11px]">{DAY_NAMES[d.getDay()]}</span>
                          <span className="text-base font-semibold">{d.getDate()}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="mt-4">
                  <h3 id="time-heading" className="text-sm font-medium">Choose a time</h3>
                  <div role="group" aria-labelledby="time-heading" className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {selectedDate ? availableTimes.length > 0 ? availableTimes.map((time) => {
                      const isSelected = selectedTime === time
                      return (
                        <button type="button" key={time} aria-pressed={isSelected} onClick={() => setSelectedTime(time)}
                          className={'min-h-11 rounded-md border px-2 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 ' +
                            (isSelected ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-zinc-300 hover:bg-zinc-50')}>
                          {time}
                        </button>
                      )
                    }) : <p className="col-span-full text-sm text-zinc-600">No available times for this date.</p>
                      : <p className="col-span-full text-sm text-zinc-600">Select a date first to see open time slots.</p>}
                  </div>
                </div>
              </section>

              <section aria-labelledby="notes-heading" className="space-y-4">
                <h2 id="notes-heading" className="text-lg font-semibold">4. Session notes</h2>
                <div>
                  <Label htmlFor="notes" className="text-zinc-700">Notes for the trainer</Label>
                  <Textarea id="notes" placeholder="Optional goals or session requests" value={notes} onChange={(e) => setNotes(e.target.value)}
                    className="mt-2 min-h-24 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 disabled:bg-slate-100 disabled:text-slate-950 disabled:opacity-100" />
                </div>
                <div>
                  <Label htmlFor="coupon" className="text-zinc-700">Promo code</Label>
                  <Input id="coupon" maxLength={32} placeholder="Enter code" value={couponCode} onChange={(e) => { setCouponCode(e.target.value); setBookingError('') }} className="mt-2 h-11 border-zinc-300 bg-white text-zinc-900 placeholder:text-zinc-500 disabled:bg-slate-100 disabled:text-slate-950 disabled:opacity-100" />
                  <div className="mt-2 text-sm" aria-live="polite">
                    {pricing.loading && <p>Checking price...</p>}
                    {pricing.error && <><p role="alert" className="text-rose-700">{pricing.error}</p><Button type="button" variant="outline" onClick={pricing.refresh} className="mt-2 border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 hover:text-zinc-900"><RefreshCw className="mr-2 h-4 w-4" />Retry price</Button></>}
                    {pricing.quote && <p className="text-emerald-800">{pricing.quote.discountInCents > 0 ? 'Promo applied: ' + formatCurrency(pricing.quote.discountInCents) + ' off. ' : ''}Total due: {formatCurrency(pricing.quote.totalAmountInCents)}</p>}
                  </div>
                </div>
              </section>
            </fieldset>

            <aside aria-labelledby="review-heading" className="min-w-0 border-t border-zinc-200 pt-6 lg:sticky lg:top-24 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
              <div className="space-y-5">
                <h2 id="review-heading" className="text-lg font-semibold">Review booking</h2>
                {service ? (
                  <div>
                    <p className="break-words font-semibold">{service.title}</p>
                    <p className="mt-1 text-sm text-zinc-600">{service.durationMinutes} min · {service.type === 'INDIVIDUAL' ? '1-on-1 session' : service.type === 'GROUP' ? 'Group session' : 'Virtual session'}</p>
                  </div>
                ) : <p className="text-sm text-zinc-600">No service selected.</p>}
                <dl className="space-y-3 text-sm">
                  <div><dt className="flex items-center gap-2 text-zinc-500"><User className="h-4 w-4" aria-hidden="true" />Athlete</dt><dd className="mt-1 break-words">{athlete ? athlete.firstName + ' ' + athlete.lastName : 'Not selected'}</dd></div>
                  <div><dt className="flex items-center gap-2 text-zinc-500"><Calendar className="h-4 w-4" aria-hidden="true" />Date</dt><dd className="mt-1 break-words">{selectedDateLabel}</dd></div>
                  <div><dt className="flex items-center gap-2 text-zinc-500"><Clock className="h-4 w-4" aria-hidden="true" />Time</dt><dd className="mt-1 break-words">{selectedTime || 'Not selected'} · {trainer.timeZone || 'Time zone unavailable'}</dd></div>
                </dl>
                <dl className="space-y-2 border-y border-zinc-200 py-4 text-sm" aria-live="polite">
                  {pricing.quote && <>
                    <div className="flex flex-wrap justify-between gap-2"><dt>Session price</dt><dd>{formatCurrency(pricing.quote.subtotalInCents)}</dd></div>
                    {pricing.quote.discountInCents > 0 && <div className="flex flex-wrap justify-between gap-2"><dt>Promo discount</dt><dd>-{formatCurrency(pricing.quote.discountInCents)}</dd></div>}
                  </>}
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><dt className="font-semibold">Total due</dt><dd data-testid="booking-total" className="whitespace-nowrap text-xl font-semibold text-emerald-800">{pricing.quote ? formatCurrency(pricing.quote.totalAmountInCents) : 'Not confirmed'}</dd></div>
                </dl>
                {bookingError && <p role="alert" className="text-sm text-rose-700">{bookingError}</p>}
                {(bookingUncertain || bookingReviewRequired) && <Link href="/parent/dashboard" className="block text-sm text-emerald-800 underline">Check saved bookings</Link>}
                <Button className="h-auto min-h-11 w-full whitespace-normal border-0 bg-emerald-700 px-3 py-3 text-white hover:bg-emerald-800"
                  disabled={!selectedService || !selectedAthlete || !selectedDate || !selectedTime || submitting || bookingReviewRequired || (!bookingUncertain && !pricing.quote)}
                  onClick={handleSubmit}>
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />Processing...</> : bookingUncertain ? <><RefreshCw className="mr-2 h-4 w-4 shrink-0" />Retry same reservation</> : pricing.quote?.totalAmountInCents === 0 ? <><CheckCircle2 className="mr-2 h-4 w-4 shrink-0" />Confirm free booking</> : <><CreditCard className="mr-2 h-4 w-4 shrink-0" />Book &amp; Pay</>}
                </Button>
                <p className="text-xs text-zinc-600">{pricing.quote?.totalAmountInCents === 0 ? 'No Stripe charge or trainer payout will be created.' : 'Price and availability are checked again before checkout.'}</p>
                {pricing.quote?.totalAmountInCents !== 0 && <p className="text-xs text-zinc-600">Payment collected at Stripe checkout</p>}
                <p className="border-t border-zinc-200 pt-4 text-xs text-zinc-600">Profile approval does not establish identity or background screening. <Link href="/legal/safety" className="text-emerald-800 underline">Safety guidelines</Link></p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}
