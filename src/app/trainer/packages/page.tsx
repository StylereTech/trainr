'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { z } from 'zod'
import { ArrowLeft, ChevronLeft, ChevronRight, Copy, Loader2, Pencil, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { packageListSchema, packageRecordSchema, packageSaveSchema, type PackageRecord, type PackageSave } from '@/lib/trainer-package-schema'

type Listing = z.infer<typeof packageListSchema>
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
const safeError = (value: unknown) => z.object({ error: z.string().min(1).max(500) }).safeParse(value)

export default function TrainerPackagesPage() {
  const [listing, setListing] = useState<Listing | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [uncertain, setUncertain] = useState(false)
  const [editor, setEditor] = useState<PackageSave | null>(null)
  const [price, setPrice] = useState('')
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState('')
  const load = useCallback(async (page = 1) => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/trainer/packages?page=${page}`, { signal: AbortSignal.timeout(15000), cache: 'no-store' })
      if (!response.ok) throw new Error('Unable to load packages. Try again.')
      setListing(packageListSchema.parse(await response.json()))
      setUncertain(false)
    } catch {
      setListing(null)
      setError('Unable to load packages. Try again.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const open = (value?: PackageRecord, duplicate = false) => {
    setFormError('')
    setSaved('')
    setPrice(value ? (value.priceInCents / 100).toFixed(2) : '')
    setEditor({ action: 'save', id: value && !duplicate ? value.id : crypto.randomUUID(), revision: value && !duplicate ? value.revision : null,
      title: value?.title || '', description: value?.description || '', priceInCents: value?.priceInCents || 0, validForDays: value?.validForDays || 90,
      items: value?.items.map(({ serviceOfferingId, sessionsCount }) => ({ serviceOfferingId, sessionsCount })) ||
        (listing?.services[0] ? [{ serviceOfferingId: listing.services[0].id, sessionsCount: 1 }] : []) })
  }
  const mutate = async (body: unknown) => {
    if (busy || loading || uncertain || !listing) return
    setBusy(true)
    setFormError('')
    setError('')
    setSaved('')
    try {
      const response = await fetch('/api/trainer/packages', { method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
      const data: unknown = await response.json()
      if (!response.ok) {
        const parsed = safeError(data)
        const message = parsed.success ? parsed.data.error : 'Package could not be saved. Reload the list.'
        if (response.status !== 400) setUncertain(true)
        if (editor) setFormError(message)
        else setError(message)
        return
      }
      const result = z.object({ package: packageRecordSchema }).parse(data)
      setEditor(null)
      setSaved(`${result.package.title} saved.`)
      await load()
    } catch {
      setUncertain(true)
      if (editor) setFormError('Save result is unknown. Reload package data before another change.')
      else setError('Save result is unknown. Reload package data before another change.')
    } finally { setBusy(false) }
  }
  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!editor) return
    if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(price)) { setFormError('Enter a USD price with at most two decimal places.'); return }
    const [dollars, fraction = ''] = price.split('.')
    const parsed = packageSaveSchema.safeParse({ ...editor, priceInCents: Number(dollars) * 100 + Number(fraction.padEnd(2, '0')) })
    if (!parsed.success) { setFormError(parsed.error.issues[0].message); return }
    void mutate(parsed.data)
  }
  const reload = () => { setEditor(null); setSaved(''); void load(listing?.page || 1) }
  const disabled = loading || busy || uncertain || !listing
  const selected = listing?.packages.find(value => value.id === editor?.id)

  return <main className="container max-w-5xl py-6 md:py-8">
    <Link href="/trainer/dashboard" className="mb-4 inline-flex items-center gap-2 text-sm text-slate-300"><ArrowLeft className="h-4 w-4" />Dashboard</Link>
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
      <div><h1 className="text-2xl font-semibold text-white">Programs &amp; Packages</h1><p className="mt-2 text-sm text-amber-200">Package checkout unavailable</p></div>
      <div className="flex gap-2">
        <Button variant="outline" size="icon" title="Refresh packages" aria-label="Refresh packages" disabled={loading || busy} onClick={reload}><RefreshCw className="h-4 w-4" /></Button>
        <Button disabled={disabled || !listing?.services.length} onClick={() => open()}><Plus className="mr-2 h-4 w-4" />New package</Button>
      </div>
    </header>
    {error && <div role="alert" className="mb-5 border-l-2 border-red-400 bg-red-400/10 p-4 text-sm text-red-100"><p>{error}</p><Button variant="outline" onClick={reload} disabled={loading || busy} className="mt-3"><RefreshCw className="mr-2 h-4 w-4" />Reload packages</Button></div>}
    {saved && <p role="status" className="mb-4 text-sm text-emerald-300">{saved}</p>}
    {loading ? <div role="status" className="flex items-center gap-2 py-12"><Loader2 className="h-5 w-5 animate-spin" />Loading packages</div> : listing && <>
      {!listing.services.length && <p className="mb-5 text-sm text-slate-300">No active services. <Link className="underline" href="/trainer/profile?tab=services">Manage services</Link></p>}
      {listing.packages.length === 0 ? <p className="py-12 text-slate-300">No packages yet.</p> : <ul className="divide-y divide-white/10">
        {listing.packages.map(value => <li key={value.id} className="grid min-w-0 gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{value.title}</h2>
            <p className="mt-1 text-sm text-slate-300">{money(value.priceInCents)} <span className="px-1">|</span> {value.totalSessions} sessions <span className="px-1">|</span> {value.validForDays} days</p>
            {value.description && <p className="mt-2 break-words text-sm text-slate-300">{value.description}</p>}
            <ul className="mt-2 space-y-1 text-sm text-slate-400">{value.items.map(item => <li key={item.serviceOfferingId} className="break-words">{item.sessionsCount} x {item.title}{!item.available && <span className="text-amber-200"> (unavailable)</span>}</li>)}</ul>
            {value.termsLocked && <p className="mt-2 text-sm text-amber-200">Booked terms locked</p>}
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <label className="mr-2 flex h-10 items-center gap-2 text-sm"><Switch aria-label={`Active listing for ${value.title}`} checked={value.isActive} disabled={disabled} onCheckedChange={isActive => void mutate({ action: 'setActive', id: value.id, revision: value.revision, isActive })} />{value.isActive ? 'Active' : 'Inactive'}</label>
            <Button variant="outline" size="icon" aria-label={`Edit ${value.title}`} title="Edit package" disabled={disabled || value.termsLocked} onClick={() => open(value)}><Pencil className="h-4 w-4" /></Button>
            <Button variant="outline" size="icon" aria-label={`Duplicate ${value.title}`} title="Duplicate package" disabled={disabled || !listing.services.length} onClick={() => open(value, true)}><Copy className="h-4 w-4" /></Button>
          </div>
        </li>)}
      </ul>}
      <nav aria-label="Package pages" className="mt-6 flex items-center justify-center gap-4 border-t border-white/10 pt-5 text-sm">
        <Button size="icon" variant="outline" title="Previous page" aria-label="Previous package page" disabled={disabled || listing.page === 1} onClick={() => void load(listing.page - 1)}><ChevronLeft className="h-4 w-4" /></Button>
        <span>Page {listing.page} of {listing.totalPages} ({listing.total})</span>
        <Button size="icon" variant="outline" title="Next page" aria-label="Next package page" disabled={disabled || listing.page === listing.totalPages} onClick={() => void load(listing.page + 1)}><ChevronRight className="h-4 w-4" /></Button>
      </nav>
    </>}
    <Dialog open={!!editor} onOpenChange={open => { if (!open && !busy) setEditor(null) }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto rounded-lg sm:max-w-xl">
        <DialogHeader><DialogTitle>{editor?.revision ? 'Edit package' : 'New package'}</DialogTitle><DialogDescription>{selected?.isActive ? 'Active catalog listing' : 'Inactive catalog listing'}</DialogDescription></DialogHeader>
        {editor && <form onSubmit={submit} className="min-w-0 space-y-4">
          <div><Label htmlFor="package-title">Title</Label><Input id="package-title" maxLength={150} value={editor.title} disabled={busy || uncertain} onChange={event => setEditor({ ...editor, title: event.target.value })} required /></div>
          <div><Label htmlFor="package-description">Description</Label><Textarea id="package-description" maxLength={2000} value={editor.description} disabled={busy || uncertain} onChange={event => setEditor({ ...editor, description: event.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4"><div><Label htmlFor="package-price">Price (USD)</Label><Input id="package-price" inputMode="decimal" value={price} disabled={busy || uncertain} onChange={event => setPrice(event.target.value)} required /></div>
            <div><Label htmlFor="package-validity">Valid for (days)</Label><Input id="package-validity" type="number" min={1} max={3650} value={editor.validForDays} disabled={busy || uncertain} onChange={event => setEditor({ ...editor, validForDays: Number(event.target.value) })} required /></div></div>
          <fieldset disabled={busy || uncertain} className="min-w-0 space-y-3"><legend className="mb-2 text-sm font-medium">Sessions</legend>
            {editor.items.map((item, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_64px_40px] items-end gap-2">
              <div className="min-w-0"><Label htmlFor={`package-service-${index}`}>Service {index + 1}</Label><select id={`package-service-${index}`} className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm" value={item.serviceOfferingId} onChange={event => setEditor({ ...editor, items: editor.items.map((value, position) => position === index ? { ...value, serviceOfferingId: event.target.value } : value) })}>
                {!listing?.services.some(service => service.id === item.serviceOfferingId) && <option value={item.serviceOfferingId}>Unavailable service</option>}
                {listing?.services.map(service => <option key={service.id} value={service.id} disabled={editor.items.some((value, position) => position !== index && value.serviceOfferingId === service.id)}>{service.title} ({service.durationMinutes} min)</option>)}
              </select></div>
              <div><Label htmlFor={`package-count-${index}`}>Count</Label><Input id={`package-count-${index}`} type="number" min={1} max={1000} value={item.sessionsCount} onChange={event => setEditor({ ...editor, items: editor.items.map((value, position) => position === index ? { ...value, sessionsCount: Number(event.target.value) } : value) })} required /></div>
              <Button type="button" size="icon" variant="outline" title="Remove service" aria-label={`Remove service ${index + 1}`} onClick={() => setEditor({ ...editor, items: editor.items.filter((_, position) => position !== index) })}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
            <Button type="button" variant="outline" disabled={editor.items.length >= 50 || !listing?.services.some(service => !editor.items.some(item => item.serviceOfferingId === service.id))} onClick={() => {
              const service = listing?.services.find(service => !editor.items.some(item => item.serviceOfferingId === service.id))
              if (service) setEditor({ ...editor, items: [...editor.items, { serviceOfferingId: service.id, sessionsCount: 1 }] })
            }}><Plus className="mr-2 h-4 w-4" />Add service</Button>
          </fieldset>
          {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            {uncertain && <Button type="button" variant="outline" disabled={busy || loading} onClick={reload}><RefreshCw className="mr-2 h-4 w-4" />Reload packages</Button>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>Cancel</Button>
            <Button type="submit" disabled={disabled}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save package</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  </main>
}
