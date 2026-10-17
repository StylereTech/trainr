'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { z } from 'zod'
import { ArrowLeft, CalendarCheck, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRemoteData } from '@/lib/use-remote-data'
import { creditBookingOptions, creditBookingResult, creditBookingSchema, type CreditBookingInput } from '@/lib/package-credit-booking-schema'
import { bookingDates, resolveBookingTime } from '@/lib/booking-time'
import { generateAvailableTimeSlots } from '@/lib/trainer'

export default function CreditBookingPage() {
  const { purchaseId } = useParams<{ purchaseId: string }>()
  const router = useRouter()
  const options = useRemoteData(`/api/bookings/credits?purchaseId=${encodeURIComponent(purchaseId)}`, creditBookingOptions)
  const [serviceId, setServiceId] = useState(''), [athleteId, setAthleteId] = useState('')
  const [date, setDate] = useState(''), [time, setTime] = useState(''), [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('')
  const inFlight = useRef(false), pending = useRef<CreditBookingInput | null>(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(timer) }, [])
  const data = options.data?.purchaseId === purchaseId ? options.data : null
  const service = data?.services.find(item => item.id === serviceId)
  const eligible = data?.athletes.filter(child => child.sportIds.includes(service?.sportId || '')) || []
  const dates = bookingDates(data?.timeZone, now)
  const times = service && data?.timeZone && data.expiresAt ? generateAvailableTimeSlots(data.slots, date, service.durationMinutes).filter(value => {
    try { const slot = resolveBookingTime(date, value, service.durationMinutes, data.timeZone); return slot.startsAt.getTime() > now && slot.startsAt.getTime() < Date.parse(data.expiresAt!) }
    catch { return false }
  }) : []
  const canReserve = !!data && !data.hold && !!service && !service.hold && service.availableCredits > 0 && eligible.some(child => child.id === athleteId) && times.includes(time)
  const submit = async () => {
    if (inFlight.current || (!pending.current && !canReserve)) return
    if (!pending.current) {
      const parsed = creditBookingSchema.safeParse({ requestId: crypto.randomUUID(), purchaseId, serviceOfferingId: serviceId,
        athleteProfileId: athleteId, date, startTime: time, timeZone: data?.timeZone, notes })
      if (!parsed.success) { setError('Review the session details before reserving.'); return }
      pending.current = parsed.data
    }
    inFlight.current = true; setBusy(true); setUncertain(true); setError('')
    try {
      const response = await fetch('/api/bookings/credits', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pending.current), signal: AbortSignal.timeout(15000), redirect: 'error' })
      const body: unknown = await response.json().catch(() => null)
      if (!response.ok) {
        const rejection = z.object({ error: z.string().min(1).max(500) }).strict().safeParse(body)
        if ([400, 401, 403, 404, 409].includes(response.status) && rejection.success) {
          pending.current = null; setUncertain(false)
          throw new Error(rejection.data.error)
        }
        throw new Error('Reservation could not be verified. Retry the same reservation or check your dashboard.')
      }
      const saved = creditBookingResult.safeParse(body)
      if (!saved.success || saved.data.creditFunding.purchaseId !== purchaseId) throw new Error('Reservation could not be verified. Retry the same reservation or check your dashboard.')
      router.push('/parent/dashboard')
      // Keep the form locked until navigation completes, including replayed outcomes.
    } catch (cause) { setError(cause instanceof Error && cause.name === 'Error' ? cause.message : 'Reservation could not be verified. Retry the same reservation or check your dashboard.') }
    finally { inFlight.current = false; setBusy(false) }
  }
  const fieldClass = 'h-10 w-full min-w-0 rounded-md border border-white/20 bg-slate-950 px-3 text-sm'
  return <div className="container max-w-3xl py-6 md:py-8">
    <Link href="/parent/packages" className="mb-5 inline-flex items-center gap-2 text-sm text-slate-300"><ArrowLeft className="h-4 w-4" />My package purchases</Link>
    <header className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
      <div className="min-w-0"><h1 className="text-2xl font-semibold">Book a package session</h1>{data && <><p className="mt-2 break-words font-medium">{data.title}</p><p className="mt-1 break-words text-sm text-slate-300">{data.trainerName}</p></>}</div>
      <Button size="icon" variant="outline" className="shrink-0" title="Refresh package availability" aria-label="Refresh package availability" disabled={busy || options.loading} onClick={() => void options.reload()}><RefreshCw className="h-4 w-4" /></Button>
    </header>
    {(error || options.error) && <div role="alert" className="my-5 border-l-2 border-amber-400 p-4 text-sm text-amber-100"><p className="break-words">{error || options.error}</p>
      <Link href="/parent/dashboard" className="mt-2 inline-block underline">Check dashboard</Link>
    </div>}
    {uncertain && error && <Button className="my-4" variant="outline" disabled={busy} onClick={() => void submit()}><RefreshCw className="mr-2 h-4 w-4" />Retry same reservation</Button>}
    {options.loading ? <p role="status" className="flex items-center gap-2 py-8"><Loader2 className="h-5 w-5 animate-spin" />Loading package sessions</p> : data && <>
      {data.hold && <p role="status" className="mt-5 break-words text-amber-200">{data.hold}</p>}
      <div className="border-b border-white/10 py-5 text-sm"><p>Shared across your children</p><p className="mt-2 break-words">Schedule time zone: {data.timeZone || 'Not set'}</p>
        <p className="mt-2 break-words">Sessions must start before: {data.expiresAt ? new Date(data.expiresAt).toLocaleString(undefined, { timeZone: data.timeZone || 'UTC', timeZoneName: 'short' }) : 'Not established'}</p>
      </div>
      <form className="space-y-5 py-6" onSubmit={event => { event.preventDefault(); void submit() }}>
        <fieldset disabled={busy || uncertain || !!data.hold} className="min-w-0 space-y-5">
          <div className="min-w-0 space-y-2"><Label htmlFor="credit-service">Session</Label><select id="credit-service" className={fieldClass} value={serviceId} onChange={event => { setServiceId(event.target.value); setAthleteId(''); setTime('') }}>
            <option value="">Select a session</option>{data.services.map(item => <option key={item.id} value={item.id} disabled={!!item.hold || item.availableCredits === 0}>{item.title} ({item.durationMinutes} min) - {item.availableCredits} {item.availableCredits === 1 ? 'credit' : 'credits'}{item.hold ? ' - unavailable' : ''}</option>)}
          </select></div>
          {data.services.every(item => item.availableCredits === 0) && <p className="break-words text-sm text-amber-200">No session credits are available for booking.</p>}
          {!data.hold && data.services.some(item => item.hold) && <ul className="space-y-2 text-sm text-amber-200">{data.services.filter(item => item.hold).map(item => <li key={item.id} className="break-words">{item.title}: {item.hold}</li>)}</ul>}
          {service && <p className="break-words text-sm text-slate-300">{service.availableCredits} {service.availableCredits === 1 ? 'credit' : 'credits'} available for {service.title}</p>}
          <div className="space-y-2"><Label htmlFor="credit-athlete">Athlete</Label><select id="credit-athlete" className={fieldClass} value={athleteId} onChange={event => setAthleteId(event.target.value)}>
            <option value="">Select an athlete</option>{eligible.map(child => <option key={child.id} value={child.id}>{child.name}</option>)}
          </select>{service && eligible.length === 0 && <Link href={data.athletes.length ? '/parent/dashboard' : '/parent/athletes/new'} className="inline-block text-sm text-emerald-300 underline">{data.athletes.length ? 'Manage athletes and sports' : 'Add an athlete'}</Link>}</div>
          <div className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="min-w-0 space-y-2"><Label htmlFor="credit-date">Date</Label><Input id="credit-date" type="date" min={dates[0]} value={date} className="min-w-0" style={{ colorScheme: 'dark' }} onChange={event => { setDate(event.target.value); setTime('') }} /></div>
            <div className="min-w-0 space-y-2"><Label htmlFor="credit-time">Start time</Label><select id="credit-time" className={fieldClass} value={time} onChange={event => setTime(event.target.value)}>
              <option value="">Select a time</option>{times.map(value => <option key={value} value={value}>{value}</option>)}
            </select>{date && service && times.length === 0 && <p className="text-sm text-amber-200">No times available on this date.</p>}</div>
          </div>
          <div className="space-y-2"><Label htmlFor="credit-notes">Session notes</Label><Textarea id="credit-notes" value={notes} maxLength={2000} onChange={event => setNotes(event.target.value)} /></div>
        </fieldset>
        <div className="border-t border-white/10 pt-5"><p className="font-medium">1 session credit. No new charge.</p>
          <p className="mt-2 text-sm text-slate-300">Parent cancellation at least 24 hours before the start returns the credit. Later cancellation or no-show uses it. Trainer cancellation returns the credit. Original expiry and payment restrictions still apply. Cash refunds are separate.</p>
          <Button type="submit" className="mt-5" disabled={busy || uncertain || !canReserve}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarCheck className="mr-2 h-4 w-4" />}Reserve with 1 credit</Button>
        </div>
      </form>
    </>}
  </div>
}
