"use client"

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'
import { Shield, Star, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { TRAINR_LOGO } from '@/lib/trainr-media'

const trustPoints = ['Verified trainers', 'Secure payments', 'Family-friendly scheduling']

export default function SignInPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ email: '', password: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const result = await signIn('credentials', {
        email: form.email,
        password: form.password,
        redirect: false,
      })

      if (result?.error) {
        toast({ title: 'Error', description: 'Invalid email or password', variant: 'destructive' })
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } catch {
      toast({ title: 'Error', description: 'Something went wrong', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-8rem)] bg-slate-950 px-4 py-8 md:py-12 text-white">
      <div className="mx-auto grid max-w-6xl items-center gap-8 lg:grid-cols-[1.05fr_.95fr]">
        <div className="premium-shell relative overflow-hidden p-0">
          <div className="relative h-[320px] md:h-[420px] lg:h-[700px]">
            <Image src="/images/trainr/custom/coaching-clean.jpg" alt="Youth athlete working with a private coach during training" fill className="object-cover" priority />
            <div className="image-wash" />
            <div className="absolute inset-x-0 bottom-0 p-6 text-white md:p-8">
              <Badge className="border-white/20 bg-white/10 text-white hover:bg-white/10">Welcome back</Badge>
              <h2 className="mt-4 text-2xl font-bold md:text-4xl">Your coaches, your schedule, your athlete&apos;s progress. All in one place.</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {trustPoints.map((point) => (
                  <div key={point} className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-sm backdrop-blur">
                    {point}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Card className="premium-card mx-auto w-full max-w-md text-white">
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
              <Shield className="mr-1 h-3.5 w-3.5" /> Secure account access
            </Badge>
            <h1 className="text-3xl font-bold">Welcome back</h1>
            <p className="text-sm text-slate-300">Sign in to manage bookings, athletes, and trainer messages.</p>
          </CardHeader>
          <CardContent>
            <div className="premium-panel mb-5 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Sparkles className="h-4 w-4 text-emerald-300" /> Your account
              </div>
              <div className="mt-2 grid gap-2">
                {['View upcoming sessions', 'Manage your athletes', 'Rebook your favorite coaches'].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="you@example.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required className="h-12 border-white/10 bg-white text-slate-900" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link href="/auth/forgot-password" className="text-xs text-emerald-300 hover:underline">Forgot password?</Link>
                </div>
                <Input id="password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required className="h-12 border-white/10 bg-white text-slate-900" />
              </div>
              <Button type="submit" className="w-full gradient-primary border-0 text-white" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign In'}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </form>

            <div className="premium-panel mt-6 p-4 text-sm text-slate-300">
              <div className="flex items-center gap-2 font-semibold text-white">
                <Star className="h-4 w-4 text-amber-400" /> Why families come back
              </div>
              <p className="mt-2">Great coaches, easy rebooking, and real results. Parents stick with Trainr because it works.</p>
            </div>
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-sm text-slate-400">Don&apos;t have an account? <Link href="/auth/signup" className="font-medium text-emerald-300 hover:underline">Sign up</Link></p>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}
