"use client"

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { formatCurrency } from '@/lib/utils'
import { catalogSpecialties, type TrainerCatalogSport } from '@/lib/trainer'
import {
  Loader2, Plus, Trash2, Save, User, DollarSign, Calendar, Briefcase,
  Building2, CreditCard, AlertTriangle, ArrowLeft,
  Clock, MapPin, Shield
} from 'lucide-react'

const TABS = [
  { id: 'profile', label: 'Personal Info', icon: User },
  { id: 'services', label: 'Services', icon: Briefcase },
  { id: 'availability', label: 'Availability', icon: Calendar },
  { id: 'payouts', label: 'Earnings & Payouts', icon: DollarSign },
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

interface ServiceForm {
  id?: string
  title: string
  description: string
  durationMinutes: number
  priceInCents: number
  type: string
  maxParticipants: number
}

interface AvailSlot {
  dayOfWeek: number
  startTime: string
  endTime: string
}

interface CertForm {
  id?: string
  name: string
  issuingOrg: string
  credentialId?: string
  isVerified?: boolean
}

interface WalletData {
  availableBalance: number
  pendingBalance: number
}

interface StripePayout {
  id: string
  amountInCents: number
  currency: string
  status: string
  arrivalDate: number
  createdAt: number
}

interface StripeStatus {
  connected: boolean
  stripeConfigured: boolean
  hasAccount: boolean
  chargesEnabled?: boolean
  payoutsEnabled?: boolean
  detailsSubmitted?: boolean
  onboardingComplete?: boolean
}

function TrainerProfileContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const initialTab = searchParams.get('tab') || 'profile'
  const [activeTab, setActiveTab] = useState(initialTab)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState<string | null>(null)
  const [minServicePrice, setMinServicePrice] = useState(1500)

  // Profile data
  const [profile, setProfile] = useState({
    firstName: '', lastName: '', headline: '', bio: '', phone: '',
    yearsExperience: 0, locationType: 'BOTH',
    address: '', city: '', state: '', zipCode: '', travelRadius: 25,
    slug: '', email: '', approvalStatus: '', stripeOnboardingComplete: false,
  })
  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [catalog, setCatalog] = useState<TrainerCatalogSport[]>([])
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([])
  const [certifications, setCertifications] = useState<CertForm[]>([])
  const [services, setServices] = useState<ServiceForm[]>([])
  const [availability, setAvailability] = useState<AvailSlot[]>([])

  // Wallet data
  const [wallet, setWallet] = useState<WalletData | null>(null)
  const [payouts, setPayouts] = useState<StripePayout[]>([])
  const [payoutSchedule, setPayoutSchedule] = useState<string | null>(null)
  const [walletLoading, setWalletLoading] = useState(initialTab === 'payouts')
  const [walletError, setWalletError] = useState('')

  // Stripe Connect
  const [stripeStatus, setStripeStatus] = useState<StripeStatus | null>(null)
  const [connectingStripe, setConnectingStripe] = useState(false)

  useEffect(() => {
    fetchProfile()
  }, [])

  useEffect(() => {
    if (activeTab === 'payouts') {
      fetchWallet()
      fetchStripeStatus()
    }
  }, [activeTab])

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/trainer/onboarding')
      if (!res.ok) throw new Error('Failed to fetch profile')
      const data = await res.json()
      if (!Array.isArray(data.catalog)) throw new Error('Unable to load sport catalog')
      setCatalog(data.catalog)
      setRevision(data.revision)
      setMinServicePrice(data.minServicePriceInCents ?? 1500)
      setProfile(data.profile)
      setSelectedSports(data.sports)
      setSelectedSpecialties(data.specialties)
      setCertifications(data.certifications.length > 0 ? data.certifications : [])
      setServices(data.services)
      setAvailability(data.availability)
    } catch (error) {
      setRevision(null)
      console.error(error)
      toast({ title: 'Error', description: 'Failed to load profile', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const fetchWallet = async () => {
    setWalletLoading(true)
    setWalletError('')
    try {
      const res = await fetch('/api/trainer/wallet', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Unable to load payouts')
      setWallet(data.wallet)
      setPayouts(data.payouts || [])
      setPayoutSchedule(data.schedule?.interval || null)
    } catch (error) {
      setWallet(null)
      setPayouts([])
      setWalletError(error instanceof Error ? error.message : 'Unable to load payouts')
    } finally {
      setWalletLoading(false)
    }
  }

  const fetchStripeStatus = async () => {
    try {
      const res = await fetch('/api/trainer/stripe-connect')
      if (!res.ok) return
      setStripeStatus(await res.json())
    } catch { /* ignore */ }
  }

  const handleSave = async () => {
    if (!profile.firstName || !profile.lastName) {
      toast({ title: 'Missing fields', description: 'First and last name are required', variant: 'destructive' })
      return
    }
    if (selectedSports.length === 0) {
      toast({ title: 'Missing fields', description: 'Select at least one sport', variant: 'destructive' })
      return
    }
    if (selectedSpecialties.length === 0) {
      toast({ title: 'Missing fields', description: 'Select at least one specialty', variant: 'destructive' })
      return
    }
    if (services.length === 0 || !services[0].title) {
      toast({ title: 'Missing fields', description: 'Add at least one service', variant: 'destructive' })
      return
    }
    if (!revision) {
      toast({ title: 'Reload required', description: 'Load the saved profile before making changes.', variant: 'destructive' })
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/trainer/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          revision,
          sports: selectedSports,
          specialties: selectedSpecialties,
          certifications: certifications.filter(c => c.id || c.name.trim()).map(({ id, name, issuingOrg, credentialId }) => ({ id, name, issuingOrg, credentialId })),
          services: services.filter(s => s.title),
          availability,
        }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Save failed')
      }
      const saved = await res.json()
      setServices(saved.services)
      setCertifications(saved.certifications)
      setSelectedSpecialties(saved.specialties)
      setRevision(saved.revision)
      toast({ title: 'Profile saved', description: 'Your changes have been saved successfully.' })
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleStripeConnect = async () => {
    setConnectingStripe(true)
    try {
      const res = await fetch('/api/payments/connect', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const url = data.dashboardUrl || data.onboardingUrl
      if (!url) throw new Error('Stripe did not return an account link')
      window.location.href = url
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' })
      setConnectingStripe(false)
    }
  }

  const toggleSport = (slug: string) => {
    setSelectedSports(prev => {
      const next = prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
      const allowed = new Set(catalogSpecialties(catalog, next).map(s => s.id))
      setSelectedSpecialties(curr => curr.filter(s => allowed.has(s)))
      return next
    })
  }

  const toggleDay = (day: number) => {
    const exists = availability.find(a => a.dayOfWeek === day)
    if (exists) {
      setAvailability(prev => prev.filter(a => a.dayOfWeek !== day))
    } else {
      setAvailability(prev => [...prev, { dayOfWeek: day, startTime: '09:00', endTime: '17:00' }])
    }
  }

  const updateAvailTime = (index: number, field: 'startTime' | 'endTime', value: string) => {
    setAvailability(prev => prev.map((a, i) => i === index ? { ...a, [field]: value } : a))
  }

  const addService = () => {
    setServices(prev => [...prev, { title: '', description: '', durationMinutes: 60, priceInCents: 5000, type: 'INDIVIDUAL', maxParticipants: 1 }])
  }

  const removeService = (index: number) => {
    setServices(prev => prev.filter((_, i) => i !== index))
  }

  const updateService = (index: number, field: string, value: any) => {
    setServices(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const addCert = () => setCertifications(prev => [...prev, { name: '', issuingOrg: '' }])
  const removeCert = (i: number) => setCertifications(prev => prev.filter((_, idx) => idx !== i))

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="container max-w-5xl py-6 md:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/trainer/dashboard" className="mb-2 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-white">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </Link>
            <h1 className="text-2xl font-bold md:text-3xl">Manage Your Profile</h1>
            <p className="mt-1 text-sm text-slate-400">Edit your info, services, schedule, and payout settings.</p>
          </div>
          {activeTab !== 'payouts' && (
            <Button className="gradient-primary border-0 text-white" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save Changes</>}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-2xl bg-slate-900 p-1.5">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-medium transition ${
                activeTab === tab.id ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <tab.icon className="h-4 w-4" /> {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'profile' && (
          <div className="space-y-6">
            {/* Personal Info */}
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader><h2 className="text-lg font-semibold">Personal Information</h2></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>First Name *</Label>
                    <Input value={profile.firstName} onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label>Last Name *</Label>
                    <Input value={profile.lastName} onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10" />
                  </div>
                </div>
                <div>
                  <Label>Headline</Label>
                  <Input value={profile.headline} onChange={e => setProfile(p => ({ ...p, headline: e.target.value }))} placeholder="e.g. Elite Quarterback Coaching" className="mt-1.5 bg-white/5 border-white/10" maxLength={100} />
                </div>
                <div>
                  <Label>Bio</Label>
                  <Textarea value={profile.bio} onChange={e => setProfile(p => ({ ...p, bio: e.target.value }))} placeholder="Tell families about your coaching experience, philosophy, and what makes your sessions special." className="mt-1.5 min-h-[120px] bg-white/5 border-white/10" maxLength={2000} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Phone</Label>
                    <Input value={profile.phone} onChange={e => setProfile(p => ({ ...p, phone: e.target.value }))} placeholder="+1 (555) 123-4567" className="mt-1.5 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label>Years of Experience</Label>
                    <Input type="number" value={profile.yearsExperience} onChange={e => setProfile(p => ({ ...p, yearsExperience: parseInt(e.target.value) || 0 }))} min={0} max={50} className="mt-1.5 bg-white/5 border-white/10" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Location */}
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader><h2 className="flex items-center gap-2 text-lg font-semibold"><MapPin className="h-5 w-5 text-emerald-300" /> Training Location</h2></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Location Type</Label>
                  <Select value={profile.locationType} onValueChange={v => setProfile(p => ({ ...p, locationType: v }))}>
                    <SelectTrigger className="mt-1.5 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN_PERSON">In-Person Only</SelectItem>
                      <SelectItem value="VIRTUAL">Virtual Only</SelectItem>
                      <SelectItem value="BOTH">In-Person + Virtual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Address / Facility</Label>
                  <Input value={profile.address} onChange={e => setProfile(p => ({ ...p, address: e.target.value }))} placeholder="e.g. North Dallas Sports Complex" className="mt-1.5 bg-white/5 border-white/10" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <Label>City</Label>
                    <Input value={profile.city} onChange={e => setProfile(p => ({ ...p, city: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10" />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Select value={profile.state} onValueChange={v => setProfile(p => ({ ...p, state: v }))}>
                      <SelectTrigger className="mt-1.5 bg-white/5 border-white/10"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        {US_STATES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>ZIP Code</Label>
                    <Input value={profile.zipCode} onChange={e => setProfile(p => ({ ...p, zipCode: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10" />
                  </div>
                </div>
                <div>
                  <Label>Travel Radius (miles)</Label>
                  <Input type="number" value={profile.travelRadius} onChange={e => setProfile(p => ({ ...p, travelRadius: parseInt(e.target.value) || 25 }))} min={5} max={100} className="mt-1.5 w-32 bg-white/5 border-white/10" />
                </div>
              </CardContent>
            </Card>

            {/* Sports */}
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader><h2 className="text-lg font-semibold">Sports & Specialties</h2></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Sports You Coach *</Label>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {catalog.filter(sport => sport.isActive || selectedSports.includes(sport.slug)).map(sport => (
                      <button
                        key={sport.slug}
                        onClick={() => toggleSport(sport.slug)}
                        className={`rounded-full border px-4 py-2 text-sm transition ${
                          selectedSports.includes(sport.slug)
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                            : 'border-white/10 text-slate-400 hover:border-white/20 hover:text-white'
                        }`}
                      >
                        {sport.icon} {sport.name}{!sport.isActive ? ' (Unavailable)' : ''}
                      </button>
                    ))}
                  </div>
                </div>
                {catalog.length === 0 && <p role="status">No sports are currently available.</p>}
                {catalogSpecialties(catalog, selectedSports).length > 0 && (
                  <div>
                    <Label>Specialties</Label>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {catalogSpecialties(catalog, selectedSports).map(spec => (
                        <button
                          key={spec.id}
                          onClick={() => setSelectedSpecialties(prev => prev.includes(spec.id) ? prev.filter(s => s !== spec.id) : [...prev, spec.id])}
                          className={`max-w-full break-words rounded-full border px-3 py-1.5 text-xs transition ${
                            selectedSpecialties.includes(spec.id)
                              ? 'border-emerald-500 bg-emerald-500/20 text-emerald-100'
                              : 'border-white/10 text-slate-400 hover:border-white/20'
                          }`}
                        >
                          {spec.name} ({spec.sportName})
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Certifications */}
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-lg font-semibold"><Shield className="h-5 w-5 text-emerald-300" /> Certifications</h2>
                  <Button variant="outline" size="sm" onClick={addCert} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Plus className="mr-1 h-3 w-3" /> Add</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {certifications.length === 0 && <p className="text-sm text-slate-400">No certifications added. Certifications build trust with families.</p>}
                {certifications.map((cert, i) => (
                  <div key={cert.id || `new-${i}`} className="flex gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                    <div className="flex-1 grid gap-3 sm:grid-cols-2">
                      <Input aria-label={`Certification ${i + 1} name`} value={cert.name} onChange={e => setCertifications(prev => prev.map((c, idx) => idx === i ? { ...c, name: e.target.value, isVerified: false } : c))} placeholder="Certification name" className="bg-white/5 border-white/10" />
                      <Input aria-label={`Certification ${i + 1} organization`} value={cert.issuingOrg} onChange={e => setCertifications(prev => prev.map((c, idx) => idx === i ? { ...c, issuingOrg: e.target.value, isVerified: false } : c))} placeholder="Issuing organization" className="bg-white/5 border-white/10" />
                      <Input aria-label={`Certification ${i + 1} credential ID`} value={cert.credentialId || ''} onChange={e => setCertifications(prev => prev.map((c, idx) => idx === i ? { ...c, credentialId: e.target.value, isVerified: false } : c))} placeholder="Credential ID" className="bg-white/5 border-white/10" />
                      <span className="self-center text-sm text-slate-300">{cert.isVerified ? 'Verified' : 'Not verified'}</span>
                    </div>
                    <Button variant="ghost" size="sm" aria-label={`Remove certification ${i + 1}`} title="Remove certification" onClick={() => removeCert(i)} className="text-red-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'services' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Your Services</h2>
              <Button variant="outline" size="sm" onClick={addService} className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Plus className="mr-1 h-3 w-3" /> Add Service</Button>
            </div>
            {services.map((svc, i) => (
              <Card key={i} className="border-white/10 bg-white/[0.04] text-white">
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between">
                    <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/30">Service {i + 1}</Badge>
                    {services.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeService(i)} className="text-red-400 hover:bg-red-500/10 hover:text-red-300"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <Label>Service Title *</Label>
                      <Input value={svc.title} onChange={e => updateService(i, 'title', e.target.value)} placeholder="e.g. Private Football Session" className="mt-1.5 bg-white/5 border-white/10" />
                    </div>
                    <div className="sm:col-span-2">
                      <Label>Description</Label>
                      <Textarea value={svc.description} onChange={e => updateService(i, 'description', e.target.value)} placeholder="What does this session include?" className="mt-1.5 bg-white/5 border-white/10" />
                    </div>
                    <div>
                      <Label>Price ($) *</Label>
                      <Input type="number" value={(svc.priceInCents / 100).toFixed(2)} onChange={e => updateService(i, 'priceInCents', Math.round(parseFloat(e.target.value) * 100) || 0)} min={minServicePrice / 100} step={0.01} className="mt-1.5 bg-white/5 border-white/10" />
                    </div>
                    <div>
                      <Label>Duration (minutes)</Label>
                      <Select value={String(svc.durationMinutes)} onValueChange={v => updateService(i, 'durationMinutes', parseInt(v))}>
                        <SelectTrigger className="mt-1.5 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[30, 45, 60, 75, 90, 120].map(d => <SelectItem key={d} value={String(d)}>{d} min</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Session Type</Label>
                      <Select value={svc.type} onValueChange={v => updateService(i, 'type', v)}>
                        <SelectTrigger className="mt-1.5 bg-white/5 border-white/10"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INDIVIDUAL">1-on-1</SelectItem>
                          <SelectItem value="GROUP">Group</SelectItem>
                          <SelectItem value="VIRTUAL">Virtual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Max Participants</Label>
                      <Input type="number" value={svc.maxParticipants} onChange={e => updateService(i, 'maxParticipants', parseInt(e.target.value) || 1)} min={1} max={50} className="mt-1.5 bg-white/5 border-white/10" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {activeTab === 'availability' && (
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardHeader><h2 className="flex items-center gap-2 text-lg font-semibold"><Clock className="h-5 w-5 text-emerald-300" /> Weekly Availability</h2></CardHeader>
            <CardContent className="space-y-3">
              {DAY_NAMES.map((name, day) => {
                const slots = availability.map((slot, index) => ({ slot, index })).filter(({ slot }) => slot.dayOfWeek === day)
                return (
                  <div key={day} data-testid={`availability-day-${day}`} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:flex-row sm:items-center">
                    <button
                      onClick={() => toggleDay(day)}
                      aria-pressed={slots.length > 0}
                      className={`w-28 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        slots.length ? 'bg-emerald-600 text-white' : 'bg-white/5 text-slate-400 hover:bg-white/10'
                      }`}
                    >
                      {name}
                    </button>
                    {slots.length ? (
                      <div className="flex w-full min-w-0 flex-col gap-3">
                        {slots.map(({ slot, index }, window) => (
                          <div key={index} className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
                            <Input type="time" aria-label={`${name} window ${window + 1} start time`} value={slot.startTime} onChange={e => updateAvailTime(index, 'startTime', e.target.value)} className="w-full min-w-0 bg-white/5 border-white/10 sm:w-32" />
                            <span className="text-slate-400">to</span>
                            <Input type="time" aria-label={`${name} window ${window + 1} end time`} value={slot.endTime} onChange={e => updateAvailTime(index, 'endTime', e.target.value)} className="w-full min-w-0 bg-white/5 border-white/10 sm:w-32" />
                            <Button size="icon" variant="ghost" aria-label={`Remove ${name} window ${window + 1}`} title={`Remove ${name} window ${window + 1}`} onClick={() => setAvailability(prev => prev.filter((_, i) => i !== index))}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ))}
                        <Button size="icon" variant="ghost" aria-label={`Add ${name} window`} title={`Add ${name} window`} onClick={() => setAvailability(prev => [...prev, { dayOfWeek: day, startTime: '13:00', endTime: '17:00' }])}><Plus className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <span className="text-sm text-slate-500">Unavailable</span>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {activeTab === 'payouts' && (
          <section className="space-y-6" aria-label="Stripe earnings and payouts">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-5">
              <div>
                <h2 className="text-lg font-semibold">Stripe Balance &amp; Bank Payouts</h2>
                <p className="mt-1 text-sm text-slate-300">
                  {payoutSchedule === 'manual'
                    ? 'Manual payout schedule. Check Stripe for available payout options.'
                    : payoutSchedule ? `Bank payout schedule: ${payoutSchedule}.` : 'Bank payout schedule not yet verified.'}
                </p>
              </div>
              <Button variant="outline" onClick={handleStripeConnect} disabled={connectingStripe}>
                {connectingStripe ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                {stripeStatus?.onboardingComplete ? 'Open Stripe Dashboard' : 'Continue Stripe Setup'}
              </Button>
            </div>

            {walletError ? (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-rose-300">
                <AlertTriangle className="h-5 w-5 shrink-0" />
                <p className="min-w-0 flex-1">{walletError}</p>
                <Button variant="outline" onClick={fetchWallet}>Retry</Button>
              </div>
            ) : walletLoading ? (
              <p role="status" className="flex items-center gap-2 text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading Stripe balances...
              </p>
            ) : wallet ? (
              <>
                <div className="grid gap-6 sm:grid-cols-2">
                  {[
                    { label: 'Available in Stripe (USD)', value: wallet.availableBalance, icon: DollarSign },
                    { label: 'Pending in Stripe (USD)', value: wallet.pendingBalance, icon: Clock },
                  ].map(item => (
                    <div key={item.label} className="border-b border-white/10 pb-4">
                      <div className="flex items-center gap-2 text-sm text-slate-300"><item.icon className="h-4 w-4" />{item.label}</div>
                      <div className="mt-2 text-2xl font-semibold">{formatCurrency(item.value)}</div>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="mb-3 text-base font-semibold">Recent Bank Payouts</h3>
                  {payouts.length === 0 ? (
                    <p className="text-sm text-slate-300">No bank payouts reported by Stripe yet.</p>
                  ) : (
                    <ul className="divide-y divide-white/10">
                      {payouts.map(payout => (
                        <li key={payout.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                          <div className="min-w-0">
                            <p className="font-semibold">{new Intl.NumberFormat('en-US', { style: 'currency', currency: payout.currency }).format(payout.amountInCents / 100)}</p>
                            <p className="text-xs text-slate-400">Arrival estimate: {new Date(payout.arrivalDate * 1000).toLocaleDateString()}</p>
                          </div>
                          <Badge>{payout.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-300">No connected Stripe balance is available yet.</p>
            )}
          </section>
        )}

        {/* Save button at bottom for mobile */}
        {activeTab !== 'payouts' && (
          <div className="mt-6 flex justify-end">
            <Button className="gradient-primary border-0 text-white" onClick={handleSave} disabled={saving}>
              {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</> : <><Save className="mr-2 h-4 w-4" /> Save All Changes</>}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function TrainerProfilePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
      <TrainerProfileContent />
    </Suspense>
  )
}
