"use client"

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { ArrowLeft, Loader2, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { TRAINR_IMAGE_CATALOG, TRAINR_LOGO } from '@/lib/trainr-media'

export default function ForgotPasswordPage() {
  const { toast } = useToast()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) return

    setLoading(true)
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })

      if (res.ok) {
        setSent(true)
      } else {
        const data = await res.json()
        toast({ title: 'Error', description: data.error || 'Something went wrong', variant: 'destructive' })
      }
    } catch {
      toast({ title: 'Error', description: 'Something went wrong', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white md:grid md:grid-cols-2">
      <div className="relative hidden overflow-hidden md:block">
        <Image
          src={TRAINR_IMAGE_CATALOG.custom.coachingClean.src}
          alt={TRAINR_IMAGE_CATALOG.custom.coachingClean.alt}
          fill
          sizes="50vw"
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 to-slate-950/20" />
        <div className="absolute bottom-8 left-8 right-8">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur">
            <ShieldCheck className="h-5 w-5 text-emerald-300" />
            <p className="mt-2 text-sm font-semibold text-white">Account recovery built for families.</p>
            <p className="mt-1 text-sm text-white/70">Reset your password in under a minute and get back to managing your athlete&apos;s training.</p>
          </div>
        </div>
      </div>

      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 text-center">
            <Image src={TRAINR_LOGO.src} alt={TRAINR_LOGO.alt} width={56} height={56} className="mx-auto rounded-2xl" />
            <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">Youth Sports Coaching</p>
          </div>

          <Card className="border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur">
            <CardContent className="p-6 md:p-8">
              {sent ? (
                <div className="text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
                    <Mail className="h-7 w-7 text-emerald-400" />
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold text-white">Check your email</h2>
                  <p className="mt-2 text-sm text-slate-300">
                    If an account with <span className="font-medium text-white">{email}</span> exists, we&apos;ve sent password reset instructions.
                  </p>
                  <p className="mt-4 text-xs text-slate-400">
                    Didn&apos;t receive it? Check spam or try again in a few minutes.
                  </p>
                  <Link href="/auth/signin">
                    <Button variant="outline" className="mt-6 w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                      <ArrowLeft className="mr-2 h-4 w-4" /> Back to Sign In
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <Badge className="mb-3 border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
                      <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Secure account recovery
                    </Badge>
                    <h2 className="text-2xl font-semibold text-white">Forgot your password?</h2>
                    <p className="mt-2 text-sm text-slate-300">
                      Enter the email address linked to your account and we&apos;ll send reset instructions.
                    </p>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <Label htmlFor="email" className="text-sm text-slate-300">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1.5 h-12 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                        required
                      />
                    </div>

                    <Button
                      type="submit"
                      className="w-full gradient-primary border-0 text-white"
                      size="lg"
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Send Reset Link
                    </Button>
                  </form>

                  <div className="mt-6 text-center text-sm text-slate-400">
                    Remember your password?{' '}
                    <Link href="/auth/signin" className="text-emerald-400 hover:text-emerald-300">Sign in</Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
