"use client"

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { TrainerCard } from '@/components/shared/TrainerCard'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import Image from 'next/image'
import { SlidersHorizontal, X, MapPin, Loader2, Trophy, Sparkles, ShieldCheck, ArrowRight, Search, Star, CheckCircle2, LayoutGrid } from 'lucide-react'
import { SPORTS } from '@/lib/utils'
import { TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'

interface Trainer {
  id: string
  slug: string
  firstName: string
  lastName: string
  headline: string | null
  city: string | null
  state: string | null
  avgRating: number
  totalReviews: number
  totalSessions: number
  locationType: string
  sports: { sport: { name: string; icon: string | null } }[]
  specialties: { specialty: { name: string; slug: string } }[]
  serviceOfferings: { priceInCents: number; durationMinutes: number }[]
  assets: { url: string; type: string; order: number }[]
  featured: boolean
}

type FilterState = {
  sport: string
  location: string
  sort: string
  rating: string
  locationType: string
}

const initialFilters = (searchParams: URLSearchParams): FilterState => ({
  sport: searchParams.get('sport') || '',
  location: searchParams.get('location') || '',
  sort: searchParams.get('sort') || 'rating',
  rating: searchParams.get('rating') || '',
  locationType: searchParams.get('locationType') || '',
})

const refinementSignals = [
  { icon: ShieldCheck, title: 'Verified coaches only', text: 'Every trainer on Trainr has a complete profile with real credentials and parent reviews.' },
  { icon: Sparkles, title: 'Filter by what matters', text: 'Narrow by sport, location, rating, and session type to find the right fit fast.' },
  { icon: LayoutGrid, title: 'Compare side by side', text: 'See ratings, pricing, specialties, and availability at a glance across every coach.' },
]

function BrowsePage() {
  const searchParams = useSearchParams()
  const [trainers, setTrainers] = useState<Trainer[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<FilterState>(() => initialFilters(searchParams))

  const fetchTrainers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.sport) params.set('sport', filters.sport)
      if (filters.location.trim()) params.set('location', filters.location.trim())
      if (filters.sort) params.set('sort', filters.sort)
      if (filters.rating) params.set('rating', filters.rating)
      if (filters.locationType) params.set('locationType', filters.locationType)
      params.set('page', page.toString())
      params.set('limit', '12')

      const res = await fetch(`/api/trainers?${params.toString()}`)
      const data = await res.json()
      setTrainers(data.trainers || [])
      setTotal(data.pagination?.total || 0)
    } catch (err) {
      console.error('Failed to fetch trainers:', err)
      setTrainers([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => {
    fetchTrainers()
  }, [fetchTrainers])

  const updateFilter = (key: keyof FilterState, value: string) => {
    const normalized = value === 'all' ? '' : value
    setFilters((prev) => ({ ...prev, [key]: normalized }))
    setPage(1)
  }

  const clearFilters = () => {
    setFilters({ sport: '', location: '', sort: 'rating', rating: '', locationType: '' })
    setPage(1)
  }

  const activeFilterCount = [filters.sport, filters.location.trim(), filters.rating, filters.locationType].filter(Boolean).length
  const featuredCount = trainers.filter((trainer) => trainer.featured).length
  const averageRating = trainers.length > 0 ? (trainers.reduce((sum, trainer) => sum + trainer.avgRating, 0) / trainers.length).toFixed(1) : '0.0'

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="site-hero border-b border-white/10">
        <Image src={TRAINR_IMAGE_CATALOG.football.hero.src} alt={TRAINR_IMAGE_CATALOG.football.hero.alt} fill priority className="object-cover" />
        <div className="hero-overlay" />
        <div className="hero-mesh" />
        <div className="container relative py-10 md:py-14">
          <div className="grid gap-8 lg:grid-cols-[1fr_.76fr] lg:items-end">
            <div className="max-w-3xl">
              <Badge className="mb-4 border border-emerald-400/30 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
                <Trophy className="mr-1 h-3.5 w-3.5" /> Browse coaches
              </Badge>
              <h1 className="text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Find a coach who actually fits your athlete.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                Search by sport, location, and session type. Read parent reviews, compare pricing, and book the right coach in minutes.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Trainers available', value: total > 0 ? total.toString() : '0', note: 'matching your search' },
                  { label: 'Featured coaches', value: featuredCount.toString(), note: 'top-rated in your area' },
                  { label: 'Avg. rating', value: averageRating, note: 'from parent reviews' },
                ].map((item) => (
                  <div key={item.label} className="premium-stat">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-slate-300">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold">{item.value}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="premium-shell p-0">
              <div className="relative overflow-hidden rounded-[2rem]">
                <Image
                  src={TRAINR_IMAGE_CATALOG.football.hero.src}
                  alt={TRAINR_IMAGE_CATALOG.football.hero.alt}
                  width={1200}
                  height={1200}
                  className="h-[300px] w-full object-contain"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5">
                  <div className="premium-panel p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Trusted by parents</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Filter by sport, location, reviews, and session type to find the right coach for your athlete.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="premium-shell mt-8 p-4 md:p-5">
            <div className="grid gap-3 lg:grid-cols-[1.2fr_auto] lg:items-center">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="City, state, or zip code"
                  className="h-12 rounded-2xl border-white/10 bg-white pl-10 text-slate-900 placeholder:text-slate-500"
                  value={filters.location}
                  onChange={(e) => updateFilter('location', e.target.value)}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:flex">
                <Button
                  variant="outline"
                  onClick={() => setShowFilters(!showFilters)}
                  className="h-12 rounded-2xl gap-2 border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white lg:flex-none"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <Badge className="ml-1 flex h-5 w-5 items-center justify-center rounded-full border-0 bg-emerald-500 p-0 text-[11px] text-white">
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
                <Button className="h-12 rounded-2xl gradient-primary border-0 text-white lg:px-6">
                  Explore
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="mobile-scroll-row mt-4 sm:grid-cols-5">
              {SPORTS.map((sport) => {
                const active = filters.sport === sport.slug
                return (
                  <button
                    key={sport.slug}
                    onClick={() => updateFilter('sport', active ? '' : sport.slug)}
                    className={`mobile-scroll-card rounded-full border px-4 py-3 text-sm transition ${
                      active
                        ? 'border-emerald-400 bg-emerald-400/15 text-emerald-100'
                        : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
                    }`}
                  >
                    {sport.icon} {sport.name}
                  </button>
                )
              })}
            </div>

            {showFilters && (
              <div className="mt-4 grid grid-cols-1 gap-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">Sport</label>
                  <Select value={filters.sport || 'all'} onValueChange={(v) => updateFilter('sport', v)}>
                    <SelectTrigger className="border-white/10 bg-white text-slate-900"><SelectValue placeholder="All Sports" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sports</SelectItem>
                      {SPORTS.map((s) => (
                        <SelectItem key={s.slug} value={s.slug}>{s.icon} {s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">Session Type</label>
                  <Select value={filters.locationType || 'all'} onValueChange={(v) => updateFilter('locationType', v)}>
                    <SelectTrigger className="border-white/10 bg-white text-slate-900"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="IN_PERSON">In Person</SelectItem>
                      <SelectItem value="VIRTUAL">Virtual</SelectItem>
                      <SelectItem value="BOTH">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">Min Rating</label>
                  <Select value={filters.rating || 'all'} onValueChange={(v) => updateFilter('rating', v)}>
                    <SelectTrigger className="border-white/10 bg-white text-slate-900"><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any</SelectItem>
                      <SelectItem value="4">4+ Stars</SelectItem>
                      <SelectItem value="4.5">4.5+ Stars</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-200">Sort By</label>
                  <Select value={filters.sort} onValueChange={(v) => updateFilter('sort', v)}>
                    <SelectTrigger className="border-white/10 bg-white text-slate-900"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rating">Highest Rated</SelectItem>
                      <SelectItem value="sessions">Most Sessions</SelectItem>
                      <SelectItem value="reviews">Most Reviews</SelectItem>
                      <SelectItem value="newest">Newest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex justify-end md:col-span-2 xl:col-span-4">
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-300 hover:bg-white/10 hover:text-white">
                    <X className="mr-1 h-4 w-4" />
                    Clear Filters
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container py-8 md:py-10">
        <div className="mobile-scroll-row mb-8 sm:grid-cols-3">
          {refinementSignals.map((item) => (
            <Card key={item.title} className="mobile-scroll-card border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5">
                <item.icon className="h-5 w-5 text-emerald-300" />
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-sm text-slate-300">
              {loading ? 'Searching for top trainers…' : `${total} trainer${total !== 1 ? 's' : ''} found`}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><Sparkles className="h-3.5 w-3.5" /> {featuredCount} featured profiles on this page</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><MapPin className="h-3.5 w-3.5" /> Search by city, state, or zip</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1.5"><Star className="h-3.5 w-3.5" /> Sort defaults to highest rated</span>
            </div>
          </div>

          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2">
              {filters.sport && (
                <Badge variant="secondary" className="gap-1 bg-white/10 text-white hover:bg-white/10">
                  {SPORTS.find((s) => s.slug === filters.sport)?.icon} {SPORTS.find((s) => s.slug === filters.sport)?.name}
                  <button onClick={() => updateFilter('sport', '')}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {filters.location && (
                <Badge variant="secondary" className="gap-1 bg-white/10 text-white hover:bg-white/10">
                  {filters.location}
                  <button onClick={() => updateFilter('location', '')}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {filters.locationType && (
                <Badge variant="secondary" className="gap-1 bg-white/10 text-white hover:bg-white/10">
                  {filters.locationType === 'IN_PERSON' ? 'In Person' : filters.locationType === 'VIRTUAL' ? 'Virtual' : 'In Person & Virtual'}
                  <button onClick={() => updateFilter('locationType', '')}><X className="h-3 w-3" /></button>
                </Badge>
              )}
              {filters.rating && (
                <Badge variant="secondary" className="gap-1 bg-white/10 text-white hover:bg-white/10">
                  {filters.rating}+ Stars
                  <button onClick={() => updateFilter('rating', '')}><X className="h-3 w-3" /></button>
                </Badge>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
          </div>
        ) : trainers.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-white/10 bg-white/[0.03] px-6 py-20 text-center">
            <div className="mb-4 text-4xl">🔍</div>
            <h3 className="mb-2 text-lg font-semibold">No trainers found</h3>
            <p className="mb-4 text-slate-400">Try adjusting your filters or expanding your search area.</p>
            <Button variant="outline" onClick={clearFilters} className="border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white">Clear Filters</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {trainers.map((trainer) => (
                <TrainerCard key={trainer.id} trainer={trainer} />
              ))}
            </div>

            {total > 12 && (
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto">
                  Previous
                </Button>
                <span className="flex items-center px-4 text-sm text-slate-400">
                  Page {page} of {Math.ceil(total / 12)}
                </span>
                <Button variant="outline" disabled={page >= Math.ceil(total / 12)} onClick={() => setPage((p) => p + 1)} className="w-full border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white sm:w-auto">
                  Next
                </Button>
              </div>
            )}
          </>
        )}

        <div className="mt-10 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-emerald-300" /> Not finding the right fit?</div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Try adjusting your filters or searching a nearby city. New coaches join Trainr every week.</p>
            </div>
            <Button variant="outline" className="w-full rounded-2xl border-white/15 bg-transparent text-white hover:bg-white/10 hover:text-white md:w-auto" onClick={clearFilters}>
              Reset search
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BrowsePagePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20">Loading...</div>}>
      <BrowsePage />
    </Suspense>
  )
}
