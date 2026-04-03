"use client"

import { useState, Suspense } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/use-toast'
import { ArrowRight, CheckCircle2, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { TRAINR_LOGO } from '@/lib/trainr-media'

function ResetPasswordForm() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (password !== confirmPassword) {
      toast({ title: 'Passwords don\'t match', variant: 'destructive' })
      return
    }

    if (password.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' })
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
        return
      }

      setSuccess(true)
    } catch {
      toast({ title: 'Error', description: 'Something went wrong', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="text-center">
        <h2 className="text-2xl font-semibold text-white">Invalid reset link</h2>
        <p className="mt-2 text-sm text-slate-300">This link is missing the reset token. Please request a new password reset.</p>
        <Link href="/auth/forgot-password">
          <Button className="mt-4 gradient-primary border-0 text-white">Request New Reset</Button>
        </Link>
      </div>
    )
  }

  if (success) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/20">
          <CheckCircle2 className="h-7 w-7 text-emerald-400" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold text-white">Password reset!</h2>
        <p className="mt-2 text-sm text-slate-300">Your password has been updated. You can now sign in with your new password.</p>
        <Link href="/auth/signin">
          <Button className="mt-6 w-full gradient-primary border-0 text-white" size="lg">
            Sign In <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="mb-6">
        <Badge className="mb-3 border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
          <ShieldCheck className="mr-1 h-3.5 w-3.5" /> Secure password reset
        </Badge>
        <h2 className="text-2xl font-semibold text-white">Set a new password</h2>
        <p className="mt-2 text-sm text-slate-300">Choose a strong password with at least 8 characters.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="password" className="text-sm text-slate-300">New Password</Label>
          <Input
            id="password"
            type="password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 h-12 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
            required
            minLength={8}
          />
        </div>
        <div>
          <Label htmlFor="confirm" className="text-sm text-slate-300">Confirm Password</Label>
          <Input
            id="confirm"
            type="password"
            placeholder="Repeat password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="mt-1.5 h-12 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
            required
            minLength={8}
          />
        </div>

        <Button type="submit" className="w-full gradient-primary border-0 text-white" size="lg" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Lock className="mr-2 h-4 w-4" />}
          Reset Password
        </Button>
      </form>
    </>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-12 text-white">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Image src={TRAINR_LOGO.src} alt={TRAINR_LOGO.alt} width={56} height={56} className="mx-auto rounded-2xl" />
          <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">Youth Sports Coaching</p>
        </div>

        <Card className="border-white/10 bg-white/[0.04] shadow-2xl backdrop-blur">
          <CardContent className="p-6 md:p-8">
            <Suspense fallback={<Loader2 className="mx-auto h-8 w-8 animate-spin" />}>
              <ResetPasswordForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
