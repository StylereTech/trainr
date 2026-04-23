"use client"

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { StarRating } from '@/components/shared/StarRating'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  MapPin, Clock, Award, Heart, Share2, MessageSquare, Calendar,
  Video, Users, Shield, ChevronLeft, CheckCircle2, Loader2, Sparkles, ArrowUpRight, Trophy, Quote
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

interface Review {
  id: string
  rating: number
  knowledgeRating: number
  communicationRating: number
  punctualityRating: number
  comment: string | null
  createdAt: string
  parentProfile: {
    user: { email: string }
  }
}

interface TrainerData {
  id: string
  firstName: string
  lastName: string
  slug: string
  headline: string | null
  bio: string | null
  city: string | null
  state: string | null
  locationType: string
  travelRadius: number
  yearsExperience: number
  avgRating: number
  totalReviews: number
  totalSessions: number
  sports: { sport: { name: string; icon: string | null } }[]
  specialties: { specialty: { name: string; slug: string } }[]
  certifications: { name: string; issuingOrg: string | null; isVerified: boolean }[]
  serviceOfferings: { id: string; title: string; description: string | null; durationMinutes: number; priceInCents: number; type: string; maxParticipants: number }[]
  packages: { id: string; title: string; description: string | null; totalSessions: number; priceInCents: number; validForDays: number; items: { serviceOffering: { title: string }; sessionsCount: number }[] }[]
  availabilitySlots: { dayOfWeek: number | null; startTime: string; endTime: string; isRecurring: boolean }[]
  assets: { url: string; type: string; order: number }[]
  reviews: Review[]
  _count: { reviews: number }
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function TrainerProfilePage() {
  const params = useParams()
  const slug = params.slug as string
  const [trainer, setTrainer] = useState<TrainerData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadTrainer = async () => {
      try {
        const res = await fetch(`/api/trainers/${slug}`)
        if (!res.ok) {
          if (active) setTrainer(null)
          return
        }

        const data = await res.json()
        if (active) {
          setTrainer(data)
        }
      } catch (error) {
        console.error('Failed to load trainer profile:', error)
        if (active) setTrainer(null)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadTrainer()

    return () => {
      active = false
    }
  }, [slug])

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!trainer) {
    return (
      <div className="container py-20 text-center">
        <h2 className="mb-2 text-2xl font-bold">Trainer Not Found</h2>
        <p className="mb-4 text-muted-foreground">The trainer you&apos;re looking for doesn&apos;t exist or is no longer available.</p>
        <Link href="/browse"><Button>Browse Trainers</Button></Link>
      </div>
    )
  }

  const initials = `${trainer.firstName[0]}${trainer.lastName[0]}`
  const photoUrl = trainer.assets.find(a => a.type === 'PHOTO' && a.order === 0)?.url
  const galleryPhotos = trainer.assets.filter(a => a.type === 'GALLERY')
  const minPrice = trainer.serviceOfferings.length > 0 ? Math.min(...trainer.serviceOfferings.map((service) => service.priceInCents)) : null
  const featuredSpecialties = trainer.specialties.slice(0, 6)
  const reviewBreakdown = [
    { label: 'Knowledge', value: trainer.reviews.length ? trainer.reviews.reduce((sum, review) => sum + review.knowledgeRating, 0) / trainer.reviews.length : 0 },
    { label: 'Communication', value: trainer.reviews.length ? trainer.reviews.reduce((sum, review) => sum + review.communicationRating, 0) / trainer.reviews.length : 0 },
    { label: 'Punctuality', value: trainer.reviews.length ? trainer.reviews.reduce((sum, review) => sum + review.punctualityRating, 0) / trainer.reviews.length : 0 },
  ]

  const availabilityByDay: Record<string, { start: string; end: string }[]> = {}
  trainer.availabilitySlots.forEach(slot => {
    const day = slot.dayOfWeek !== null ? DAY_NAMES[slot.dayOfWeek] : 'One-time'
    if (!availabilityByDay[day]) availabilityByDay[day] = []
    availabilityByDay[day].push({ start: slot.startTime, end: slot.endTime })
  })

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.22),_transparent_38%),linear-gradient(180deg,_#04130b_0%,_#08131f_100%)]">
        <div className="container py-4 md:py-6">
          <Link href="/browse" className="inline-flex items-center text-sm text-slate-300 transition-colors hover:text-white">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to Browse
          </Link>
        </div>

        <div className="container pb-8 md:pb-12">
          <div className="grid gap-6 lg:grid-cols-[1.18fr_.82fr]">
            <Card className="overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.05] text-white shadow-2xl">
              <CardContent className="p-0">
                <div className="grid gap-0 md:grid-cols-[280px_1fr]">
                  <div className="relative min-h-[260px] border-b border-white/10 md:min-h-full md:border-b-0 md:border-r">
                    {photoUrl ? (
                      <img src={photoUrl} alt={trainer.firstName} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.28),_transparent_35%),linear-gradient(160deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.03))]">
                        <Avatar className="h-28 w-28 border border-white/15">
                          <AvatarFallback className="gradient-primary rounded-2xl text-4xl text-white">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                  </div>

                  <div className="p-5 md:p-7">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className="border border-emerald-400/20 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
                            <Sparkles className="mr-1 h-3.5 w-3.5" /> Premium profile
                          </Badge>
                          {trainer.sports.slice(0, 2).map((sport, index) => (
                            <Badge key={index} className="border border-white/10 bg-white/10 text-white hover:bg-white/10">
                              {sport.sport.icon} {sport.sport.name}
                            </Badge>
                          ))}
                        </div>
                        <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">{trainer.firstName} {trainer.lastName}</h1>
                        {trainer.headline && <p className="mt-2 text-base text-slate-300 md:text-lg">{trainer.headline}</p>}
                        <div className="mt-4">
                          <StarRating rating={trainer.avgRating} showValue reviewCount={trainer.totalReviews} />
                        </div>
                      </div>

                      <div className="flex gap-2 self-start">
                        <Button variant="outline" size="icon" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Heart className="h-4 w-4" /></Button>
                        <Button variant="outline" size="icon" className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"><Share2 className="h-4 w-4" /></Button>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-300">
                        <div className="flex items-center gap-2 text-white"><Clock className="h-4 w-4 text-emerald-300" /> Experience</div>
                        <div className="mt-1 font-semibold text-white">{trainer.yearsExperience} years</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-300">
                        <div className="flex items-center gap-2 text-white"><Users className="h-4 w-4 text-emerald-300" /> Sessions</div>
                        <div className="mt-1 font-semibold text-white">{trainer.totalSessions} completed</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-300">
                        <div className="flex items-center gap-2 text-white"><MapPin className="h-4 w-4 text-emerald-300" /> Location</div>
                        <div className="mt-1 font-semibold text-white">{trainer.city && trainer.state ? `${trainer.city}, ${trainer.state}` : trainer.locationType === 'VIRTUAL' ? 'Virtual only' : 'Travel-based'}</div>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-3 text-sm text-slate-300">
                        <div className="flex items-center gap-2 text-white"><Shield className="h-4 w-4 text-emerald-300" /> Verified</div>
                        <div className="mt-1 font-semibold text-white">{trainer.certifications.filter((cert) => cert.isVerified).length} certs listed</div>
                      </div>
                    </div>

                    {featuredSpecialties.length > 0 && (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {featuredSpecialties.map((specialty, index) => (
                          <Badge key={index} variant="outline" className="border-white/15 bg-white/5 text-slate-200">
                            {specialty.specialty.name}
                          </Badge>
                        ))}
                      </div>
                    )}

                    <div className="mt-6 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Best for</div>
                        <p className="mt-2 text-sm text-slate-300">Families who want a clearer sense of coach quality, structure, and session fit before booking.</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Session style</div>
                        <p className="mt-2 text-sm text-slate-300">Offerings are presented with cleaner pricing and format badges so mobile scanning is faster.</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-emerald-300">Trust layer</div>
                        <p className="mt-2 text-sm text-slate-300">Reviews, certifications, and profile hierarchy now work together instead of competing visually.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-6">
              <Card className="rounded-[2rem] border-white/10 bg-white/[0.05] text-white shadow-2xl">
                <CardHeader className="pb-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Book with confidence</div>
                  <h2 className="text-2xl font-semibold">Quick decision panel</h2>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="rounded-2xl bg-slate-950/50 p-4 text-center">
                    <div className="text-sm text-slate-400">Starting at</div>
                    <div className="mt-1 text-3xl font-bold text-white">{minPrice !== null ? formatCurrency(minPrice) : 'Request quote'}</div>
                    <div className="mt-1 text-xs text-slate-400">per session</div>
                  </div>

                  <Link href={`/book/${trainer.slug}`}>
                    <Button className="gradient-primary w-full border-0 text-white" size="lg">
                      <Calendar className="mr-2 h-4 w-4" />
                      Book Now
                    </Button>
                  </Link>

                  <Link href={`/messages?to=${trainer.id}`}>
                    <Button variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white" size="lg">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Send Message
                    </Button>
                  </Link>

                  <Separator className="bg-white/10" />

                  <div className="space-y-3 text-sm text-slate-300">
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Background verified</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Identity verified</div>
                    <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Transparent pricing before checkout</div>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-[2rem] border-white/10 bg-white/[0.05] text-white shadow-xl">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Trophy className="h-4 w-4" /> Why this profile now converts better</div>
                  <p className="mt-3 text-sm text-slate-300">This profile reads like a premium coaching destination with clearer hierarchy, stronger trust framing, and tighter mobile decision blocks.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-8 md:py-10">
        <Tabs defaultValue="about">
          <TabsList className="grid w-full grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-2 md:flex md:w-auto md:flex-wrap md:justify-start">
            <TabsTrigger value="about">About</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="reviews">Reviews ({trainer._count.reviews})</TabsTrigger>
            <TabsTrigger value="gallery">Gallery</TabsTrigger>
          </TabsList>

          <TabsContent value="about" className="mt-4">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <h3 className="text-xl font-semibold">About this trainer</h3>
                {trainer.bio ? (
                  <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-300 md:text-base">{trainer.bio}</div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">No bio provided.</p>
                )}

                {trainer.certifications.length > 0 && (
                  <>
                    <Separator className="my-6 bg-white/10" />
                    <h3 className="text-lg font-semibold">Certifications</h3>
                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      {trainer.certifications.map((cert, i) => (
                        <div key={i} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                          <div className="flex items-start gap-2">
                            {cert.isVerified ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                            ) : (
                              <Award className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
                            )}
                            <div>
                              <div className="text-sm font-medium text-white">{cert.name}</div>
                              {cert.issuingOrg && <div className="text-xs text-slate-400">{cert.issuingOrg}</div>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <Separator className="my-6 bg-white/10" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="text-sm text-slate-400">Location type</div>
                    <div className="mt-1 font-medium text-white">{trainer.locationType === 'IN_PERSON' ? 'In Person' : trainer.locationType === 'VIRTUAL' ? 'Virtual Only' : 'In Person & Virtual'}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="text-sm text-slate-400">Travel radius</div>
                    <div className="mt-1 font-medium text-white">{trainer.travelRadius} miles</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="text-sm text-slate-400">Experience</div>
                    <div className="mt-1 font-medium text-white">{trainer.yearsExperience} years</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    <div className="text-sm text-slate-400">Sessions completed</div>
                    <div className="mt-1 font-medium text-white">{trainer.totalSessions}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="services" className="mt-4">
            <div className="space-y-4">
              {trainer.serviceOfferings.map((service) => (
                <Card key={service.id} className="border-white/10 bg-white/[0.04] text-white">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-semibold">{service.title}</h4>
                          <Badge className="border border-white/10 bg-white/10 text-white hover:bg-white/10">
                            {service.type === 'INDIVIDUAL' ? '1-on-1' : service.type === 'GROUP' ? 'Group' : service.type === 'VIRTUAL' ? 'Virtual' : 'Session'}
                          </Badge>
                          {service.type === 'VIRTUAL' && <Video className="h-4 w-4 text-emerald-300" />}
                        </div>
                        {service.description && <p className="mt-2 text-sm text-slate-300">{service.description}</p>}
                        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {service.durationMinutes} min</span>
                          {service.type === 'GROUP' && <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> Max {service.maxParticipants}</span>}
                        </div>
                      </div>
                      <div className="rounded-2xl bg-slate-950/50 px-4 py-3 text-left md:text-right">
                        <div className="text-2xl font-bold text-white">{formatCurrency(service.priceInCents)}</div>
                        <div className="text-xs text-slate-400">per session</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {trainer.packages.length > 0 && (
                <>
                  <h3 className="pt-2 text-lg font-semibold text-white">Packages</h3>
                  {trainer.packages.map((pkg) => (
                    <Card key={pkg.id} className="border-emerald-500/20 bg-white/[0.04] text-white">
                      <CardContent className="p-5">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <h4 className="text-lg font-semibold">{pkg.title}</h4>
                            {pkg.description && <p className="mt-1 text-sm text-slate-300">{pkg.description}</p>}
                            <div className="mt-3 space-y-2">
                              {pkg.items.map((item, i) => (
                                <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                                  {item.sessionsCount}× {item.serviceOffering.title}
                                </div>
                              ))}
                            </div>
                            <p className="mt-3 text-xs text-slate-400">Valid for {pkg.validForDays} days</p>
                          </div>
                          <div className="rounded-2xl bg-slate-950/50 px-4 py-3 text-left md:text-right">
                            <div className="text-2xl font-bold text-white">{formatCurrency(pkg.priceInCents)}</div>
                            <div className="text-xs text-slate-400">{pkg.totalSessions} sessions</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="availability" className="mt-4">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <h3 className="text-xl font-semibold">Weekly Availability</h3>
                {Object.keys(availabilityByDay).length > 0 ? (
                  <div className="mt-5 grid gap-3">
                    {DAY_NAMES.filter(day => availabilityByDay[day]).map(day => (
                      <div key={day} className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 md:flex md:items-center md:gap-4">
                        <div className="mb-3 w-28 text-sm font-medium text-white md:mb-0">{day}</div>
                        <div className="flex flex-wrap gap-2">
                          {availabilityByDay[day].map((slot, i) => (
                            <Badge key={i} variant="outline" className="border-white/15 bg-white/5 font-mono text-slate-200">
                              {slot.start} – {slot.end}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-slate-400">Contact trainer for availability.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reviews" className="mt-4">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <div className="grid gap-4 lg:grid-cols-[.8fr_1.2fr]">
                  <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-5">
                    <div className="text-4xl font-bold">{trainer.avgRating.toFixed(1)}</div>
                    <StarRating rating={trainer.avgRating} size="sm" />
                    <div className="mt-1 text-sm text-slate-400">{trainer.totalReviews} reviews</div>
                  </div>
                  <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-5">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-300"><Quote className="h-4 w-4" /> Review signals</div>
                    <div className="space-y-3">
                      {reviewBreakdown.map((item) => (
                        <div key={item.label}>
                          <div className="mb-1 flex items-center justify-between text-xs text-slate-300">
                            <span>{item.label}</span>
                            <span>{item.value.toFixed(1)}/5</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/10">
                            <div className="gradient-primary h-2 rounded-full" style={{ width: `${(item.value / 5) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <Separator className="my-6 bg-white/10" />

                <div className="space-y-5">
                  {trainer.reviews.map((review) => (
                    <div key={review.id} className="rounded-[1.5rem] border border-white/10 bg-slate-950/45 p-4 md:p-5">
                      <div className="flex items-start gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-white/10 text-xs text-white">
                            {review.parentProfile.user.email[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <div className="text-sm font-medium text-white">{review.parentProfile.user.email.split('@')[0]}</div>
                              <div className="text-xs text-slate-400">{new Date(review.createdAt).toLocaleDateString()}</div>
                            </div>
                            <StarRating rating={review.rating} size="sm" />
                          </div>
                          {review.comment && <p className="mt-3 text-sm leading-relaxed text-slate-300">{review.comment}</p>}
                          <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-400">
                            <span>Knowledge: {review.knowledgeRating}/5</span>
                            <span>Communication: {review.communicationRating}/5</span>
                            <span>Punctuality: {review.punctualityRating}/5</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="gallery" className="mt-4">
            <Card className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-xl font-semibold">Gallery</h3>
                  <div className="text-xs text-slate-400">Profile media and training moments</div>
                </div>
                {galleryPhotos.length > 0 ? (
                  <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-3">
                    {galleryPhotos.map((photo, i) => (
                      <div key={i} className="group relative overflow-hidden rounded-2xl border border-white/10">
                        <img src={photo.url} alt={`Gallery ${i + 1}`} className="aspect-square w-full object-cover transition duration-300 group-hover:scale-105" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-slate-950/45 p-6 text-sm text-slate-400">
                    No photos uploaded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </section>

      <section className="container pb-16">
        <Card className="overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.05] text-white">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between md:p-8">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Ready to move</div>
              <h3 className="mt-2 text-2xl font-semibold">Take the next step with {trainer.firstName}.</h3>
              <p className="mt-2 max-w-2xl text-sm text-slate-300">The redesigned profile leads naturally into booking or messaging, with stronger mobile readability and less visual clutter.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href={`/book/${trainer.slug}`}>
                <Button className="gradient-primary w-full border-0 text-white sm:w-auto">Book a session</Button>
              </Link>
              <Link href={`/messages?to=${trainer.id}`}>
                <Button variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto">
                  Message trainer
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
