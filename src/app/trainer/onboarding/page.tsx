"use client"

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/components/ui/use-toast'
import { SPORTS, TRAINR_LAUNCH_STATE, US_STATES } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { getSpecialtyOptionsForSports, normalizeSpecialtySelections } from '@/lib/trainer'
import { Loader2, ChevronLeft, ChevronRight, Check, Plus, Trash2 } from 'lucide-react'

const STEPS = ['Sports', 'Profile', 'Services', 'Availability', 'Review']

interface ServiceForm {
  title: string; description: string; durationMinutes: number; priceInCents: number; type: string; maxParticipants: number;
}
interface AvailSlot { dayOfWeek: number; startTime: string; endTime: string; }
interface CertForm { name: string; issuingOrg: string; }

export default function TrainerOnboardingPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)

  const [selectedSports, setSelectedSports] = useState<string[]>([])
  const [selectedSpecialties, setSelectedSpecialties] = useState<string[]>([])

  const [profile, setProfile] = useState({
    firstName: '', lastName: '', headline: '', bio: '', phone: '',
    yearsExperience: 0, locationType: 'BOTH',
    address: '', city: 'Dallas', state: TRAINR_LAUNCH_STATE, zipCode: '', travelRadius: 25,
  })

  const [certifications, setCertifications] = useState<CertForm[]>([{ name: '', issuingOrg: '' }])

  const [services, setServices] = useState<ServiceForm[]>([{
    title: '', description: '', durationMinutes: 60, priceInCents: 5000, type: 'INDIVIDUAL', maxParticipants: 1,
  }])

  const [availability, setAvailability] = useState<AvailSlot[]>([])

  const toggleSport = (slug: string) => {
    setSelectedSports((prev) => {
      const nextSports = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
      const allowedSpecialties = new Set(getSpecialtyOptionsForSports(nextSports).map((spec) => spec.slug))
      setSelectedSpecialties((current) => current.filter((spec) => allowedSpecialties.has(spec)))
      return nextSports
    })
  }

  const toggleSpecialty = (specialtySlug: string) => {
    setSelectedSpecialties((prev) =>
      prev.includes(specialtySlug) ? prev.filter((s) => s !== specialtySlug) : [...prev, specialtySlug]
    )
  }

  const availableSpecialties = getSpecialtyOptionsForSports(selectedSports)

  const toggleDayAvailability = (day: number) => {
    const existing = availability.find(a => a.dayOfWeek === day)
    if (existing) {
      setAvailability(prev => prev.filter(a => a.dayOfWeek !== day))
    } else {
      setAvailability(prev => [...prev, { dayOfWeek: day, startTime: '09:00', endTime: '17:00' }])
    }
  }

  const updateAvailTime = (day: number, field: 'startTime' | 'endTime', value: string) => {
    setAvailability(prev => prev.map(a => a.dayOfWeek === day ? { ...a, [field]: value } : a))
  }

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

  const handleSubmit = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/trainer/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...profile,
          yearsExperience: Number(profile.yearsExperience),
          travelRadius: Number(profile.travelRadius),
          sports: selectedSports,
          specialties: normalizeSpecialtySelections(selectedSpecialties),
          certifications: certifications.filter(c => c.name),
          services: services.map(s => ({ ...s, priceInCents: Number(s.priceInCents), durationMinutes: Number(s.durationMinutes), maxParticipants: Number(s.maxParticipants) })),
          availability,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        toast({ title: 'Error', description: data.error, variant: 'destructive' })
        return
      }

      toast({ title: 'Profile saved!', description: 'Your trainer profile is pending review.' })
      router.push('/trainer/dashboard')
    } catch {
      toast({ title: 'Error', description: 'Something went wrong', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const canProceed = () => {
    switch (step) {
      case 0: return selectedSports.length > 0 && selectedSpecialties.length > 0
      case 1: return profile.firstName && profile.lastName && profile.bio
      case 2: return services.length > 0 && services.every(s => s.title && s.priceInCents >= 1500)
      case 3: return availability.length > 0
      default: return true
    }
  }

  return (
    <div className="bg-gray-50 min-h-screen py-8">
      <div className="container max-w-2xl">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((s, i) => (
              <div key={i} className="flex items-center">
                <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  i < step ? 'bg-primary text-white' : i === step ? 'gradient-primary text-white' : 'bg-gray-200 text-gray-500'
                }`}>
                  {i < step ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && <div className={`w-8 h-0.5 mx-2 ${i < step ? 'bg-primary' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="text-center">
            <h2 className="text-lg font-bold">{STEPS[step]}</h2>
            <p className="text-sm text-muted-foreground">Step {step + 1} of {STEPS.length}</p>
          </div>
        </div>

        {/* Step 0: Sports & Specialties */}
        {step === 0 && (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <Label className="text-base font-semibold">Which sports do you coach?</Label>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  {SPORTS.map(sport => (
                    <button key={sport.slug} type="button" onClick={() => toggleSport(sport.slug)}
                      className={`p-4 rounded-lg border-2 text-left transition-colors ${selectedSports.includes(sport.slug) ? 'border-primary bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}>
                      <span className="text-2xl">{sport.icon}</span>
                      <div className="font-medium mt-1">{sport.name}</div>
                    </button>
                  ))}
                </div>
              </div>

              {selectedSports.length > 0 && (
                <div>
                  <Label className="text-base font-semibold">What are your specialties?</Label>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {availableSpecialties.map(spec => (
                      <button key={spec.slug} type="button" onClick={() => toggleSpecialty(spec.slug)}
                        className={`px-3 py-1.5 rounded-full border text-sm transition-colors ${selectedSpecialties.includes(spec.slug) ? 'border-primary bg-primary text-white' : 'border-gray-200 hover:border-gray-300'}`}>
                        {spec.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 1: Profile */}
        {step === 1 && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>First Name</Label><Input value={profile.firstName} onChange={e => setProfile({...profile, firstName: e.target.value})} /></div>
                <div><Label>Last Name</Label><Input value={profile.lastName} onChange={e => setProfile({...profile, lastName: e.target.value})} /></div>
              </div>
              <div><Label>Headline</Label><Input placeholder="e.g. Former D1 QB Coach, 10+ years experience" value={profile.headline} onChange={e => setProfile({...profile, headline: e.target.value})} maxLength={100} /></div>
              <div><Label>Bio</Label><Textarea placeholder="Tell parents about yourself, your coaching philosophy, and experience..." value={profile.bio} onChange={e => setProfile({...profile, bio: e.target.value})} maxLength={2000} rows={5} /></div>
              <div><Label>Phone</Label><Input placeholder="(555) 123-4567" value={profile.phone} onChange={e => setProfile({...profile, phone: e.target.value})} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Years Experience</Label><Input type="number" min={0} max={50} value={profile.yearsExperience} onChange={e => setProfile({...profile, yearsExperience: parseInt(e.target.value) || 0})} /></div>
                <div>
                  <Label>Location Type</Label>
                  <Select value={profile.locationType} onValueChange={v => setProfile({...profile, locationType: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IN_PERSON">In Person</SelectItem>
                      <SelectItem value="VIRTUAL">Virtual Only</SelectItem>
                      <SelectItem value="BOTH">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>City</Label><Input value={profile.city} onChange={e => setProfile({...profile, city: e.target.value})} /></div>
                <div>
                  <Label>State</Label>
                  <Select value={profile.state} onValueChange={state => setProfile({...profile, state})}>
                    <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                    <SelectContent>
                      {US_STATES.map(state => (
                        <SelectItem key={state.code} value={state.code}>{state.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>Zip Code</Label><Input value={profile.zipCode} onChange={e => setProfile({...profile, zipCode: e.target.value})} /></div>
                <div><Label>Travel Radius (miles)</Label><Input type="number" min={5} max={100} value={profile.travelRadius} onChange={e => setProfile({...profile, travelRadius: parseInt(e.target.value) || 25})} /></div>
              </div>

              <Separator />
              <div>
                <Label className="text-base font-semibold">Certifications</Label>
                {certifications.map((cert, i) => (
                  <div key={i} className="flex gap-2 mt-2">
                    <Input placeholder="Certification name" value={cert.name} onChange={e => { const c = [...certifications]; c[i].name = e.target.value; setCertifications(c) }} />
                    <Input placeholder="Issuing org" value={cert.issuingOrg} onChange={e => { const c = [...certifications]; c[i].issuingOrg = e.target.value; setCertifications(c) }} />
                    {certifications.length > 1 && <Button variant="ghost" size="icon" onClick={() => setCertifications(certifications.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                ))}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setCertifications([...certifications, { name: '', issuingOrg: '' }])}>
                  <Plus className="h-4 w-4 mr-1" /> Add Certification
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Services */}
        {step === 2 && (
          <Card>
            <CardContent className="p-6 space-y-4">
              {services.map((svc, i) => (
                <div key={i} className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-sm">Service {i + 1}</span>
                    {services.length > 1 && <Button variant="ghost" size="icon" onClick={() => setServices(services.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>}
                  </div>
                  <div><Label>Title</Label><Input placeholder="e.g. 1-on-1 Quarterback Training" value={svc.title} onChange={e => { const s = [...services]; s[i].title = e.target.value; setServices(s) }} /></div>
                  <div><Label>Description</Label><Textarea placeholder="What does this session include?" value={svc.description} onChange={e => { const s = [...services]; s[i].description = e.target.value; setServices(s) }} rows={2} /></div>
                  <div className="grid grid-cols-3 gap-3">
                    <div><Label>Duration (min)</Label><Input type="number" min={15} max={480} value={svc.durationMinutes} onChange={e => { const s = [...services]; s[i].durationMinutes = parseInt(e.target.value); setServices(s) }} /></div>
                    <div><Label>Price ($)</Label><Input type="number" min={15} value={svc.priceInCents / 100} onChange={e => { const s = [...services]; s[i].priceInCents = parseInt(e.target.value) * 100; setServices(s) }} /></div>
                    <div>
                      <Label>Type</Label>
                      <Select value={svc.type} onValueChange={v => { const s = [...services]; s[i].type = v; setServices(s) }}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INDIVIDUAL">1-on-1</SelectItem>
                          <SelectItem value="GROUP">Group</SelectItem>
                          <SelectItem value="VIRTUAL">Virtual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              <Button variant="outline" onClick={() => setServices([...services, { title: '', description: '', durationMinutes: 60, priceInCents: 5000, type: 'INDIVIDUAL', maxParticipants: 1 }])}>
                <Plus className="h-4 w-4 mr-1" /> Add Another Service
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Availability */}
        {step === 3 && (
          <Card>
            <CardContent className="p-6 space-y-3">
              <p className="text-sm text-muted-foreground">Select the days you&apos;re available and set your hours.</p>
              {DAY_NAMES.map((day, i) => {
                const slot = availability.find(a => a.dayOfWeek === i)
                const isActive = !!slot
                return (
                  <div key={i} className={`flex items-center gap-4 p-3 rounded-lg border ${isActive ? 'border-primary bg-green-50' : 'border-gray-200'}`}>
                    <button type="button" onClick={() => toggleDayAvailability(i)} className={`w-20 text-left font-medium text-sm ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {day}
                    </button>
                    {isActive && (
                      <div className="flex items-center gap-2 flex-1">
                        <Input type="time" value={slot.startTime} onChange={e => updateAvailTime(i, 'startTime', e.target.value)} className="w-32" />
                        <span className="text-sm text-muted-foreground">to</span>
                        <Input type="time" value={slot.endTime} onChange={e => updateAvailTime(i, 'endTime', e.target.value)} className="w-32" />
                      </div>
                    )}
                    {!isActive && <span className="text-sm text-muted-foreground flex-1">Not available</span>}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <Card>
            <CardContent className="p-6 space-y-4">
              <h3 className="font-semibold">Review Your Profile</h3>
              <div className="space-y-3 text-sm">
                <div><span className="text-muted-foreground">Sports:</span> {selectedSports.map(s => SPORTS.find(sp => sp.slug === s)?.name).join(', ')}</div>
                <div><span className="text-muted-foreground">Specialties:</span> {selectedSpecialties.join(', ')}</div>
                <div><span className="text-muted-foreground">Name:</span> {profile.firstName} {profile.lastName}</div>
                {profile.headline && <div><span className="text-muted-foreground">Headline:</span> {profile.headline}</div>}
                <div><span className="text-muted-foreground">Experience:</span> {profile.yearsExperience} years</div>
                <div><span className="text-muted-foreground">Location:</span> {profile.city && profile.state ? `${profile.city}, ${profile.state}` : 'Not set'} ({profile.locationType})</div>
                <div><span className="text-muted-foreground">Services:</span> {services.length} service(s) starting at {formatCurrency(Math.min(...services.map(s => s.priceInCents)))}</div>
                <div><span className="text-muted-foreground">Availability:</span> {availability.length} day(s)</div>
              </div>

              <div className="bg-yellow-50 p-4 rounded-lg text-sm">
                <strong>Note:</strong> Your profile will be reviewed by our team before going live. This usually takes 24–48 hours.
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={() => setStep(s => s - 1)} disabled={step === 0}>
            <ChevronLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button className="gradient-primary text-white border-0" onClick={() => setStep(s => s + 1)} disabled={!canProceed()}>
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button className="gradient-primary text-white border-0" onClick={handleSubmit} disabled={loading}>
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Submitting...</> : 'Submit Profile'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
