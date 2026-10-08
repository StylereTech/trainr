'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { CheckCircle2, Mail, RefreshCw } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { useRemoteData } from '@/lib/use-remote-data'
import { TRAINR_LOGO } from '@/lib/trainr-media'

const statusSchema = z.object({ verified: z.boolean(), role: z.enum(['PARENT', 'TRAINER', 'ADMIN']) })
const deliverySchema = z.object({ status: z.enum(['accepted', 'verified']) })

export default function VerificationForm() {
  const query = useSearchParams()
  const token = query.get('token')
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const current = useRemoteData('/api/auth/verify', statusSchema)
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const verified = confirmed || (!token && current.data?.verified === true)

  async function act(verify: boolean) {
    if (busy) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const response = await fetch(verify ? '/api/auth/verify' : '/api/auth/verification-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verify ? { token } : {}), signal: AbortSignal.timeout(15000),
      })
      const data = await response.json()
      if (!response.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Unable to complete this request.')
        return
      }
      if (verify) {
        z.object({ success: z.literal(true) }).parse(data)
        setConfirmed(true)
        router.replace('/account/verify-email')
      } else {
        const result = deliverySchema.parse(data)
        if (result.status === 'verified') setConfirmed(true)
        else setMessage('Verification email accepted for delivery. Check your inbox and spam folder.')
      }
      if (sessionStatus === 'authenticated') await current.reload()
    } catch {
      setError(sessionStatus === 'authenticated' ? 'The request could not be confirmed. Check your verification status before trying again.' : 'The request could not be confirmed. Sign in to check your verification status.')
    } finally { setBusy(false) }
  }

  return <main className="min-h-[70vh] bg-zinc-950 px-4 py-12 text-white">
    <div className="mx-auto max-w-lg space-y-6">
      <Image src={TRAINR_LOGO.src} alt={TRAINR_LOGO.alt} width={48} height={48} />
      <h1 className="text-2xl font-semibold">Email verification</h1>
      {verified ? <p role="status" className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-5 w-5 shrink-0" />Your email address is verified.</p>
        : <>
          <p className="text-zinc-300">Confirm your email address using the link in your verification email.</p>
          {token && <Button disabled={busy} onClick={() => act(true)}><CheckCircle2 className="mr-2 h-4 w-4" />Verify email address</Button>}
          {!token && sessionStatus === 'authenticated' && <Button variant="outline" disabled={busy} onClick={() => act(false)}><Mail className="mr-2 h-4 w-4" />Send verification email</Button>}
        </>}
      {!token && sessionStatus === 'authenticated' && <div className="flex items-center gap-3 text-sm">
        <Button variant="outline" size="icon" aria-label="Refresh verification status" title="Refresh verification status" disabled={busy || current.loading} onClick={current.reload}><RefreshCw className="h-4 w-4" /></Button>
        <span>{current.loading ? 'Checking status...' : current.error ? 'Current verification status is unavailable.' : verified ? 'Verified' : 'Not verified'}</span>
      </div>}
      {message && <p role="status" className="text-emerald-300">{message}</p>}
      {error && <p role="alert" className="text-rose-300">{error}</p>}
      {token && sessionStatus === 'authenticated' && <Link href="/account/verify-email" className="block text-sky-300 underline">Check my account verification status</Link>}
      <Link href={sessionStatus === 'authenticated' ? '/dashboard' : '/auth/signin'} className="inline-block text-sky-300 underline">{sessionStatus === 'authenticated' ? 'Continue to dashboard' : 'Sign in'}</Link>
    </div>
  </main>
}
