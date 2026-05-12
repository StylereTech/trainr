'use client'

import { useState } from 'react'
import { signOut, useSession } from 'next-auth/react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/components/ui/use-toast'

export default function DeleteAccountPage() {
  const { data: session, status } = useSession()
  const { toast } = useToast()
  const [confirmation, setConfirmation] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleted, setDeleted] = useState(false)

  const canDelete = confirmation.trim().toUpperCase() === 'DELETE'

  async function handleDelete() {
    if (!canDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch('/api/account', { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Unable to delete account')
      setDeleted(true)
      toast({ title: 'Account deleted', description: 'Your Trainr account has been permanently deleted.' })
      setTimeout(() => signOut({ callbackUrl: '/' }), 1200)
    } catch (error) {
      toast({ title: 'Deletion failed', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setIsDeleting(false)
    }
  }

  if (status === 'loading') {
    return <main className="container min-h-[70vh] py-16 text-white">Loading account settings...</main>
  }

  if (!session?.user) {
    return (
      <main className="container min-h-[70vh] py-16 text-white">
        <Card className="mx-auto max-w-xl border-white/10 bg-slate-900/80 text-white">
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription className="text-slate-300">Sign in to manage or delete your Trainr account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/auth/signin"><Button>Sign In</Button></Link>
          </CardContent>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-[80vh] bg-slate-950 py-12 text-white">
      <div className="container mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">Account settings</p>
          <h1 className="mt-3 text-3xl font-bold">Delete your Trainr account</h1>
          <p className="mt-2 text-slate-300">You can permanently delete your account directly in the app. No phone call or email is required.</p>
        </div>

        {deleted ? (
          <Card className="border-emerald-400/20 bg-emerald-500/10 text-white">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-300" /> Account deletion confirmed</CardTitle>
              <CardDescription className="text-emerald-50/80">Your account has been deleted and you will be signed out.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-emerald-300" /> What happens when you delete</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-300">
                <p>Trainr removes or anonymizes your account email, password access, profile details, phone number, address, uploaded assets, notifications, saved favorites, and personal message content.</p>
                <p>Records we must keep for safety, dispute, fraud prevention, payment, tax, or legal reasons may be retained in anonymized form.</p>
                <p>After deletion, you cannot sign in with this account again. You can create a new account later with the same email.</p>
              </CardContent>
            </Card>

            <Card className="border-rose-400/25 bg-rose-500/10 text-white">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-rose-300" /> Permanent deletion</CardTitle>
                <CardDescription className="text-rose-50/80">Type DELETE below, then tap Delete Account to confirm.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="delete-confirm">Confirmation</Label>
                  <Input id="delete-confirm" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} placeholder="Type DELETE" className="border-white/10 bg-slate-950/70 text-white" />
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button variant="destructive" disabled={!canDelete || isDeleting} onClick={handleDelete} className="bg-rose-600 hover:bg-rose-500">
                    <Trash2 className="mr-2 h-4 w-4" /> {isDeleting ? 'Deleting...' : 'Delete Account'}
                  </Button>
                  <Link href={(session.user as any).role === 'TRAINER' ? '/trainer/dashboard' : '/parent/dashboard'}>
                    <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">Cancel</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </main>
  )
}