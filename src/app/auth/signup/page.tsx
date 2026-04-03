"use client"

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Sparkles, ShieldCheck, Trophy, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { TRAINR_LOGO } from '@/lib/trainr-media'

function SignUpPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const defaultRole = searchParams.get('role') === 'trainer' ? 'TRAINER' : 'PARENT'
  const [form, setForm] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
    phone: '',
    role: defaultRole as 'PARENT' | 'TRAINER',
    agreeToTerms: false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (form.password !== form.confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' })
      return
    }

    if (!form.agreeToTerms) {
      toast({ title: 'Error', description: 'You must agree to the terms', variant: 'destructive' })
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      const data = await res.json()

      if (!res.ok) {
        toast({ title: 'Error', description: data.error || 'Registration failed', variant: 'destructive' })
        return
      }

      toast({ title: 'Success', description: 'Account created! Please sign in.' })
      router.push('/auth/signin')
    } catch {
      toast({ title: 'Error', description: 'Something went wrong', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const trainerMode = form.role === 'TRAINER'
  const heroImage = { src: '/images/trainr/custom/signup-hero.jpg', alt: 'Youth athletes training together on indoor turf' }

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-950 px-4 py-8 md:py-12 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[.95fr_1.05fr]">
        <Card className="premium-card order-2 w-full text-white lg:order-1">
          <CardHeader className="pb-2 text-center">
            <Link href="/" className="mb-5 flex items-center justify-center gap-3">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-sm">
                <Image src={TRAINR_LOGO.src} alt={TRAINR_LOGO.alt} width={44} height={44} className="h-11 w-11 object-cover" />
              </div>
              <div className="text-left">
                <span className="block text-xl font-bold text-white">Trainr</span>
                <span className="text-xs uppercase tracking-[0.18em] text-emerald-200">Youth sports coaching</span>
              </div>
            </Link>
            <Badge className="mx-auto mb-4 border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Premium onboarding
            </Badge>
            <h1 className="text-3xl font-bold">Create your account</h1>
            <p className="text-sm text-slate-300">{trainerMode ? 'Start coaching, earning, and building your reputation.' : 'Find the right trainer for your athlete with more confidence.'}</p>
          </CardHeader>
          <CardContent>
            <div className="premium-panel mb-5 p-4 text-sm text-slate-300">
              <div className="font-semibold text-white">What this unlocks</div>
              <div className="mt-2 grid gap-2">
                {(trainerMode
                  ? ['Publish a premium coach profile', 'Offer services and availability', 'Build verified reviews over time']
                  : ['Save athletes and session preferences', 'Request bookings with context', 'Track trusted coaches in one place']
                ).map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-white/[0.05] p-1">
                <button type="button" onClick={() => setForm({ ...form, role: 'PARENT' })} className={`rounded-lg py-2 text-sm font-medium transition-colors ${!trainerMode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300'}`}>👨‍👩‍👧 Parent</button>
                <button type="button" onClick={() => setForm({ ...form, role: 'TRAINER' })} className={`rounded-lg py-2 text-sm font-medium transition-colors ${trainerMode ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-300'}`}>🏋️ Trainer</button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="firstName">First Name</Label><Input id="firstName" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required className="h-12 border-white/10 bg-white text-slate-900" /></div>
                <div className="space-y-2"><Label htmlFor="lastName">Last Name</Label><Input id="lastName" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required className="h-12 border-white/10 bg-white text-slate-900" /></div>
              </div>

              <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="h-12 border-white/10 bg-white text-slate-900" /></div>
              <div className="space-y-2"><Label htmlFor="phone">Phone (optional)</Label><Input id="phone" type="tel" placeholder="(555) 123-4567" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="h-12 border-white/10 bg-white text-slate-900" /></div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="password">Password</Label><Input id="password" type="password" placeholder="Min. 8 characters" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} className="h-12 border-white/10 bg-white text-slate-900" /></div>
                <div className="space-y-2"><Label htmlFor="confirmPassword">Confirm Password</Label><Input id="confirmPassword" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required className="h-12 border-white/10 bg-white text-slate-900" /></div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <Checkbox id="terms" checked={form.agreeToTerms} onCheckedChange={(checked) => setForm({ ...form, agreeToTerms: checked as boolean })} />
                <Label htmlFor="terms" className="text-xs font-normal leading-relaxed text-slate-300">I agree to the <Link href="/legal/terms" className="text-emerald-300 hover:underline">Terms of Service</Link> and <Link href="/legal/privacy" className="text-emerald-300 hover:underline">Privacy Policy</Link></Label>
              </div>

              <Button type="submit" className="w-full gradient-primary border-0 text-white" disabled={loading}>
                {loading ? 'Creating account...' : trainerMode ? 'Create Trainer Account' : 'Create Parent Account'}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-slate-400">Already have an account? <Link href="/auth/signin" className="font-medium text-emerald-300 hover:underline">Sign in</Link></p>
          </CardFooter>
        </Card>

        <div className="order-1 lg:order-2">
          <div className="premium-shell p-0">
            <div className="relative h-[300px] md:h-[380px] lg:h-[720px] overflow-hidden">
              <Image src={heroImage.src} alt={heroImage.alt} fill sizes="(max-width: 768px) 100vw, 50vw" className="object-cover object-center" priority />
              <div className="image-wash" />
              <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
                <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">
                  {trainerMode ? <Trophy className="mr-1 h-3.5 w-3.5" /> : <ShieldCheck className="mr-1 h-3.5 w-3.5" />}
                  {trainerMode ? 'Built for serious coaches' : 'Built for careful parents'}
                </Badge>
                <h2 className="mt-4 text-2xl font-bold md:text-4xl">{trainerMode ? 'Turn your expertise into a premium coaching business.' : 'Discover trusted coaching without the guesswork.'}</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  {(trainerMode ? ['Set your own rates', 'Fill your schedule', 'Build verified reviews'] : ['Compare real trainers', 'Book around your schedule', 'Track athlete progress']).map((point) => (
                    <div key={point} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm backdrop-blur">{point}</div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function SignUpPagePage() {
  return <Suspense fallback={<div className="flex justify-center py-20 text-white">Loading...</div>}><SignUpPage /></Suspense>
}
