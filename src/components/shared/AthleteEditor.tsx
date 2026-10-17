'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw, Save, Trash2 } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRemoteData } from '@/lib/use-remote-data'
import { athleteProfileSchema } from '@/lib/validations'
import { athleteListSchema, athleteResponseSchema, type AthleteProfile } from '@/lib/athlete-contract'

type Props = { athleteId?: string; onSaved?: (athlete: AthleteProfile) => void; onPendingChange?: (pending: boolean) => void }
export function AthleteEditor({ athleteId, onSaved, onPendingChange }: Props) {
  const remote = useRemoteData('/api/athletes', athleteListSchema)
  if (remote.loading) return <p role="status" className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Loading athlete details...</p>
  if (!remote.data) return <div role="alert">Athlete details are unavailable.<Button variant="outline" onClick={remote.reload}><RefreshCw className="mr-2 h-4 w-4" />Retry athletes</Button></div>
  const athlete = remote.data.athletes.find(item => item.id === athleteId)
  if (athleteId && !athlete) return <div role="alert">Athlete not found.<Link href="/parent/dashboard" className="ml-2 underline">Return to dashboard</Link></div>
  return <AthleteForm key={athlete?.updatedAt || 'new'} athlete={athlete} catalog={remote.data.catalog} reload={remote.reload} onSaved={onSaved} onPendingChange={onPendingChange} />
}

function AthleteForm({ athlete, catalog, reload, onSaved, onPendingChange }: { athlete?: AthleteProfile; catalog: z.infer<typeof athleteListSchema>['catalog']; reload: () => Promise<boolean>; onSaved?: Props['onSaved']; onPendingChange?: Props['onPendingChange'] }) {
  const router = useRouter()
  const [form, setForm] = useState({ firstName: athlete?.firstName || '', lastName: athlete?.lastName || '', dateOfBirth: athlete?.dateOfBirth.slice(0, 10) || '',
    gender: athlete?.gender || 'PREFER_NOT_TO_SAY', skillLevel: athlete?.skillLevel || 'BEGINNER', goals: athlete?.goals.join('\n') || '', notes: athlete?.notes || '', sports: athlete?.sports.map(item => item.sport.id) || [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  useEffect(() => { onPendingChange?.(busy || uncertain || needsReload) }, [busy, uncertain, needsReload, onPendingChange])
  const inFlight = useRef(false)
  const pending = useRef<{ body: string; requestId: string } | null>(null)
  const sports = [...catalog, ...(athlete?.sports.map(item => item.sport).filter(sport => !catalog.some(option => option.id === sport.id)) || [])]
  const finish = (saved?: AthleteProfile) => {
    if (saved && onSaved) onSaved(saved)
    else { router.push('/parent/dashboard'); router.refresh() }
  }
  async function save(remove = false) {
    if (inFlight.current || needsReload || (remove && !confirmDelete)) return
    let body: string
    try {
      if (remove && athlete) body = JSON.stringify({ revision: athlete.updatedAt })
      else if (!athlete && uncertain && pending.current) body = pending.current.body
      else {
        const data = athleteProfileSchema.parse({ ...form, goals: form.goals.split('\n').map(value => value.trim()).filter(Boolean) })
        if (athlete) body = JSON.stringify({ ...data, revision: athlete.updatedAt })
        else {
          const requestId = pending.current?.requestId || crypto.randomUUID()
          body = JSON.stringify({ ...data, requestId })
          pending.current = { body, requestId }
        }
      }
    } catch (error) { setError(error instanceof z.ZodError ? error.errors[0].message : 'Check the athlete details.'); return }
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const response = await fetch(athlete ? `/api/athletes/${athlete.id}` : '/api/athletes', { method: remove ? 'DELETE' : athlete ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(15000) })
      const data = await response.json()
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Save could not be confirmed.')
        if (response.status === 400) { setUncertain(false); pending.current = null }
        else if (athlete || response.status === 409) setNeedsReload(true)
        else setUncertain(true)
        return
      }
      if (remove) { z.object({ deleted: z.literal(true) }).parse(data); finish() }
      else finish(athleteResponseSchema.parse(data))
    } catch {
      setError(athlete ? 'Change could not be confirmed. Reload the athlete before another action.' : 'Save could not be confirmed. Retry the same save to check its outcome.')
      if (athlete) setNeedsReload(true)
      else setUncertain(true)
    } finally { inFlight.current = false; setBusy(false) }
  }
  const inputClass = 'mt-1 bg-white text-zinc-950'
  return <form onSubmit={event => { event.preventDefault(); void save() }} className="space-y-5">
    <fieldset disabled={busy || uncertain || needsReload} className="min-w-0 space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><Label htmlFor="athlete-first">First name</Label><Input id="athlete-first" required maxLength={50} value={form.firstName} onChange={event => setForm({ ...form, firstName: event.target.value })} className={inputClass} /></div>
        <div><Label htmlFor="athlete-last">Last name</Label><Input id="athlete-last" required maxLength={50} value={form.lastName} onChange={event => setForm({ ...form, lastName: event.target.value })} className={inputClass} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><Label htmlFor="athlete-dob">Date of birth</Label><Input id="athlete-dob" type="date" required max={new Date().toISOString().slice(0, 10)} value={form.dateOfBirth} onChange={event => setForm({ ...form, dateOfBirth: event.target.value })} className={inputClass} /></div>
        <div><Label htmlFor="athlete-gender">Gender</Label><select id="athlete-gender" value={form.gender} onChange={event => setForm({ ...form, gender: event.target.value as typeof form.gender })} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm text-zinc-950"><option value="PREFER_NOT_TO_SAY">Prefer not to say</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="NON_BINARY">Non-binary</option></select></div>
        <div><Label htmlFor="athlete-skill">Skill level</Label><select id="athlete-skill" value={form.skillLevel} onChange={event => setForm({ ...form, skillLevel: event.target.value as typeof form.skillLevel })} className="mt-1 h-10 w-full rounded-md border bg-white px-2 text-sm text-zinc-950"><option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option></select></div>
      </div>
      <fieldset><legend className="mb-2 text-sm font-medium">Sports</legend><div className="grid gap-3 sm:grid-cols-2">{sports.map(sport => <label key={sport.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.sports.includes(sport.id)} disabled={!sport.isActive && !form.sports.includes(sport.id)} onChange={event => setForm({ ...form, sports: event.target.checked ? [...form.sports, sport.id] : form.sports.filter(id => id !== sport.id) })} className="h-4 w-4 accent-emerald-600" />{sport.name}{!sport.isActive && ' (unavailable)'}</label>)}</div>{catalog.length === 0 && <p role="status" className="text-sm">No sports are currently available.</p>}</fieldset>
      <div><Label htmlFor="athlete-goals">Goals</Label><Textarea id="athlete-goals" value={form.goals} onChange={event => setForm({ ...form, goals: event.target.value })} rows={3} className={inputClass} /></div>
      <div><Label htmlFor="athlete-notes">Parent notes</Label><Textarea id="athlete-notes" value={form.notes} maxLength={2000} onChange={event => setForm({ ...form, notes: event.target.value })} rows={3} className={inputClass} /></div>
    </fieldset>
    {error && <p role="alert" className="text-sm text-rose-500">{error}</p>}
    {needsReload ? <Button type="button" variant="outline" onClick={reload}><RefreshCw className="mr-2 h-4 w-4" />Reload athlete</Button> : <Button type="submit" disabled={busy || (!uncertain && catalog.length === 0)}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}{uncertain ? 'Retry same save' : 'Save athlete profile'}</Button>}
    {athlete && <div className="space-y-3 border-t border-current/20 pt-5">{athlete._count.bookings ? <p className="text-sm">Booking history is retained. Contact support to review profile removal.</p> : <><label className="flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy || needsReload} checked={confirmDelete} onChange={event => setConfirmDelete(event.target.checked)} />Delete this athlete profile</label><Button type="button" variant="destructive" disabled={!confirmDelete || busy || needsReload} onClick={() => void save(true)}><Trash2 className="mr-2 h-4 w-4" />Delete athlete</Button></>}</div>}
  </form>
}
