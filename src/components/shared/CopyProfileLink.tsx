'use client'

import { useState } from 'react'
import { Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function CopyProfileLink({ slug }: { slug: string }) {
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [fallback, setFallback] = useState('')

  async function copyLink() {
    setBusy(true)
    setCopied(false)
    setFallback('')
    const url = `${window.location.origin}/trainers/${encodeURIComponent(slug)}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      setFallback(url)
    } finally {
      setBusy(false)
    }
  }

  return <div className="min-w-0 space-y-2">
    <Button type="button" variant="outline" size="icon" aria-label="Copy profile link" title="Copy profile link"
      disabled={busy} onClick={() => void copyLink()} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
    </Button>
    <p role="status" className="text-sm text-emerald-200">{copied ? 'Profile link copied.' : fallback ? 'Clipboard unavailable.' : ''}</p>
    {fallback && <Input aria-label="Profile link" readOnly value={fallback} onFocus={event => event.target.select()} className="w-full min-w-0" />}
  </div>
}
