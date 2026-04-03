"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { SPORTS } from '@/lib/utils'
import { Loader2, ChevronLeft, PlusCircle, ShieldCheck, Sparkles } from 'lucide-react'

export default function NewAthletePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: 'PREFER_NOT_TO_SAY',
    skillLevel: 'BEGINNER',
    goals: '',
    notes: '',
    sports: [] as string[],
  })

  const toggleSport = (slug: string) => {
    setForm((current) => ({
      ...current,
      sports: current.sports.includes(slug)
        ? current.sports.filter((sport) => sport !== slug)
        : [...current.sports, slug],
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (form.sports.length === 0) {
      toast({ title: 'Choose a sport', description: 'Select at least one sport for your athlete.', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/athletes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, goals: form.goals.split('\n').map((goal) => goal.trim()).filter(Boolean) }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Could not save athlete', description: data.error || 'Please try again.', variant: 'destructive' })
        return
      }
      toast({ title: 'Athlete added', description: 'Your athlete profile is ready for booking.' })
      router.push('/parent/dashboard')
      router.refresh()
    } catch {
      toast({ title: 'Something went wrong', description: 'Please try again.', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 py-8 text-white">
      <div className="container max-w-3xl">
        <Link href="/parent/dashboard" className="mb-4 inline-flex items-center text-sm text-slate-400 hover:text-white">
          <ChevronLeft className="mr-1 h-4 w-4" /> Back to dashboard
        </Link>

        <div className="mb-6 rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_32%),linear-gradient(180deg,_rgba(255,255,255,0.06),_rgba(255,255,255,0.03))] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100"><Sparkles className="h-4 w-4" /> Parent setup</div>
          <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Add your athlete</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">Build the profile once so every future booking feels fast, confident, and consistent with the new premium family dashboard.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader><h2 className="font-semibold">Athlete details</h2></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div><Label htmlFor="firstName">First name</Label><Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required className="mt-2 h-12 border-white/10 bg-slate-950/60 text-white" /></div>
                <div><Label htmlFor="lastName">Last name</Label><Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required className="mt-2 h-12 border-white/10 bg-slate-950/60 text-white" /></div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div><Label htmlFor="dateOfBirth">Date of birth</Label><Input id="dateOfBirth" type="date" value={form.dateOfBirth} onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} required className="mt-2 h-12 border-white/10 bg-slate-950/60 text-white" /></div>
                <div>
                  <Label htmlFor="gender">Gender</Label>
                  <select id="gender" value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} className="mt-2 flex h-12 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white">
                    <option value="PREFER_NOT_TO_SAY">Prefer not to say</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="NON_BINARY">Non-binary</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="skillLevel">Skill level</Label>
                  <select id="skillLevel" value={form.skillLevel} onChange={(e) => setForm({ ...form, skillLevel: e.target.value })} className="mt-2 flex h-12 w-full rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white">
                    <option value="BEGINNER">Beginner</option><option value="INTERMEDIATE">Intermediate</option><option value="ADVANCED">Advanced</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader><h2 className="font-semibold">Sports & goals</h2></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select sports</Label>
                <div className="mt-3 flex flex-wrap gap-3">
                  {SPORTS.map((sport) => {
                    const active = form.sports.includes(sport.slug)
                    return <button key={sport.slug} type="button" onClick={() => toggleSport(sport.slug)} className={`rounded-full border px-4 py-2 text-sm transition-colors ${active ? 'border-emerald-400/30 bg-emerald-400/15 text-white' : 'border-white/10 bg-slate-950/60 text-slate-200 hover:border-white/20 hover:bg-white/10'}`}>{sport.icon} {sport.name}</button>
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="goals">Goals</Label>
                <Textarea id="goals" rows={4} placeholder="One goal per line, e.g.\nImprove footwork\nBuild confidence before tryouts" value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} className="mt-2 border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500" />
                <p className="mt-2 text-xs text-slate-400">These appear in booking context so trainers can tailor sessions.</p>
              </div>

              <div>
                <Label htmlFor="notes">Parent notes</Label>
                <Textarea id="notes" rows={4} placeholder="Anything a trainer should know — injuries, preferences, motivation style, scheduling constraints." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-2 border-white/10 bg-slate-950/60 text-white placeholder:text-slate-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="border border-dashed border-white/10 bg-white/[0.04] text-white">
            <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2 font-semibold text-white"><PlusCircle className="h-4 w-4 text-emerald-300" /> Ready to book faster</div>
                <p className="mt-1 text-sm text-slate-400">After saving this athlete, you can request sessions from any approved trainer.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.sports.map((sport) => {
                  const item = SPORTS.find((entry) => entry.slug === sport)
                  return item ? <Badge key={sport} variant="secondary" className="bg-white/10 text-slate-100">{item.icon} {item.name}</Badge> : null
                })}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="inline-flex items-center gap-2 text-sm text-slate-400"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Private family workflow now visually aligned with dashboard + booking.</div>
            <Button type="submit" size="lg" className="gradient-primary border-0 text-white" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving athlete...</> : 'Save athlete profile'}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
