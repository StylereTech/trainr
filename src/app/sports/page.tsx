import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { ArrowRight, Search, Sparkles, Trophy, ShieldCheck, CheckCircle2, Layers3, Medal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SPORTS, SPECIALTIES } from '@/lib/utils'
import { getSportVisual, isLiveTrainrImage, TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'

export const metadata: Metadata = {
  title: 'Sports',
  description: 'Browse youth sports trainers across football, baseball, basketball, soccer, and track & field.',
}

const sportDescriptions: Record<string, { tagline: string; description: string; benefits: string[]; developmentFocus: string; trustNote: string; categoryTone: string }> = {
  football: {
    tagline: 'Elite Football Training',
    description: 'From quarterback mechanics to defensive fundamentals, find the right football trainer for your athlete with position-specific development and clearer family expectations.',
    benefits: ['Position-specific drills', 'Speed & agility work', 'Film study prep', 'Combine preparation'],
    developmentFocus: 'Ideal for athletes building explosiveness, confidence, and position IQ.',
    trustNote: 'Live football training imagery is now wired into the media system for stronger category trust.',
    categoryTone: 'Explosive, disciplined, and built for stronger position-specific confidence.',
  },
  baseball: {
    tagline: 'Professional Baseball Coaching',
    description: 'Hitting, pitching, catching, and fielding — connect with coaches who understand youth baseball mechanics and long-term development.',
    benefits: ['Hitting mechanics', 'Pitching velocity & command', 'Catching techniques', 'Defensive fundamentals'],
    developmentFocus: 'Perfect for athletes refining mechanics without rushing form.',
    trustNote: 'Live baseball imagery is already wired into the experience for richer category storytelling.',
    categoryTone: 'Measured, technical, and ideal for long-horizon player development.',
  },
  basketball: {
    tagline: 'Next-Level Basketball Skills',
    description: 'Shooting, ball handling, footwork, and game IQ — discover basketball trainers who help athletes become more complete players.',
    benefits: ['Shooting form & accuracy', 'Ball handling & dribbling', 'Defensive positioning', 'Game situation training'],
    developmentFocus: 'Great for guards, wings, and youth players building confidence under pressure.',
    trustNote: 'Live basketball visuals are available in-repo and now support premium category presentation.',
    categoryTone: 'Fast, polished, and confidence-building for athletes who need game-ready reps.',
  },
  soccer: {
    tagline: 'World-Class Soccer Training',
    description: 'From strikers to goalkeepers, find soccer trainers who can develop technique, movement, and decision-making in a structured environment.',
    benefits: ['Ball control & dribbling', 'Passing & receiving', 'Position-specific training', 'Speed & conditioning'],
    developmentFocus: 'Built for families prioritizing technical repetition and tactical growth.',
    trustNote: 'Live soccer training imagery is now available in the repo and mapped into the category card.',
    categoryTone: 'Technical, fluid, and shaped around movement quality and repetition.',
  },
  'track-field': {
    tagline: 'Championship Track & Field Coaching',
    description: 'Sprinting, jumps, throws, hurdles, and distance — specialized coaches for every event with a strong focus on mechanics and progression.',
    benefits: ['Sprint mechanics', 'Hurdle technique', 'Jump form & distance', 'Throwing fundamentals'],
    developmentFocus: 'Best for athletes focused on discipline, repeatable form, and measurable performance gains.',
    trustNote: 'Live track & field sprint imagery is now mapped into the category experience.',
    categoryTone: 'Precise, repeatable, and built around measurable progression.',
  },
}

const categoryHighlights = [
  { icon: ShieldCheck, title: 'Parent-first clarity', description: 'Each sport rail frames trainer discovery around safety, skill fit, and progression.' },
  { icon: Sparkles, title: 'Premium presentation', description: 'Live approved imagery now supports all five core sports while the shared mapping system stays ready for future categories.' },
  { icon: Trophy, title: 'Development-driven copy', description: 'Every category now explains what families can expect before they browse trainers.' },
]

const consistencySignals = ['Consistent category cards', 'Placeholder-safe media routing', 'Cleaner small-screen browsing']

export default function SportsPage() {
  return (
    <div className="bg-slate-950 text-white">
      <section className="site-hero border-b border-white/10">
        <Image src={TRAINR_IMAGE_CATALOG.soccer.brand.src} alt={TRAINR_IMAGE_CATALOG.soccer.brand.alt} fill priority className="object-cover" />
        <div className="hero-overlay" />
        <div className="hero-mesh" />
        <div className="container relative py-12 md:py-20">
          <div className="grid gap-10 lg:grid-cols-[1.02fr_.98fr] lg:items-center">
            <div className="max-w-3xl">
              <div className="premium-kicker mb-5">
                <Layers3 className="h-4 w-4" /> Premium sport collections
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">Explore every sport through a more premium, consistent discovery lens.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Families can now scan sport-by-sport coaching categories with sharper value framing and richer approved imagery across every core sport.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-200">
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">5 youth sports</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Live media mapping across all core sports</span>
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">Mobile-first category browsing</span>
              </div>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/browse">
                  <Button size="lg" className="w-full rounded-2xl border-0 bg-white text-emerald-900 hover:bg-emerald-50 sm:w-auto">
                    Browse all trainers
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/how-it-works">
                  <Button size="lg" variant="outline" className="w-full rounded-2xl border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto">
                    How discovery works
                  </Button>
                </Link>
              </div>
            </div>

            <div className="space-y-4">
              <Card className="premium-shell overflow-hidden border-white/10 bg-white/5 p-0 text-white shadow-2xl">
                <div className="grid gap-0 sm:grid-cols-[1.1fr_.9fr]">
                  <div className="relative min-h-[240px]">
                    <Image
                      src={TRAINR_IMAGE_CATALOG.baseball.brand.src}
                      alt={TRAINR_IMAGE_CATALOG.baseball.brand.alt}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-950/70 via-slate-950/20 to-transparent" />
                  </div>
                  <div className="p-6">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">Category spotlight</div>
                    <h2 className="mt-3 text-2xl font-semibold">All five core sports now anchor a more premium browse experience.</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-300">Approved imagery is now live across football, baseball, basketball, soccer, and track & field, with the fallback system still protecting any future missing categories.</p>
                  </div>
                </div>
              </Card>

              <div className="mobile-scroll-row sm:grid-cols-3">
                {categoryHighlights.map((item) => (
                  <Card key={item.title} className="mobile-scroll-card border-white/10 bg-white/[0.05] text-white">
                    <CardContent className="p-5">
                      <item.icon className="h-5 w-5 text-emerald-300" />
                      <h3 className="mt-4 font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-8 md:py-10">
        <div className="container grid gap-4 md:grid-cols-3">
          {consistencySignals.map((label) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-slate-200">
              <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-300" />
              {label}
            </div>
          ))}
        </div>
      </section>

      <section className="pb-16 md:pb-24">
        <div className="container space-y-6 md:space-y-8">
          {SPORTS.map((sport, index) => {
            const info = sportDescriptions[sport.slug]
            const specialties = SPECIALTIES[sport.slug] || []
            const visual = getSportVisual(sport.slug)

            return (
              <Card key={sport.slug} className="overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.04] text-white shadow-xl">
                <div className={`grid lg:grid-cols-[.95fr_1.05fr] ${index % 2 === 1 ? 'lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1' : ''}`}>
                  <div className="relative min-h-[300px] border-b border-white/10 lg:min-h-full lg:border-b-0 lg:border-r lg:[&.order-2]:border-l lg:[&.order-2]:border-r-0">
                    {isLiveTrainrImage(visual) ? (
                      <>
                        <Image src={visual.src} alt={visual.alt} fill className="object-cover" />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/35 to-transparent" />
                      </>
                    ) : (
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.28),_transparent_38%),linear-gradient(160deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.02))]" />
                    )}

                    {!isLiveTrainrImage(visual) && (
                      <div className="absolute right-4 top-4 rounded-full border border-white/15 bg-slate-950/60 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-200">Live mapped</div>
                    )}

                    <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                      <Badge className="border border-white/15 bg-slate-950/60 text-white hover:bg-slate-950/60">
                        {sport.icon} {sport.name}
                      </Badge>
                      <h2 className="mt-3 text-2xl font-semibold md:text-3xl">{info.tagline}</h2>
                      <p className="mt-2 max-w-lg text-sm leading-6 text-slate-200 md:text-base">{info.description}</p>
                    </div>
                  </div>

                  <CardContent className="p-5 md:p-8">
                    <div className="grid gap-5 md:grid-cols-[1.05fr_.95fr]">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Development focus</div>
                        <p className="mt-3 text-sm leading-6 text-slate-300 md:text-base">{info.developmentFocus}</p>

                        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Medal className="h-4 w-4 text-emerald-300" /> Category tone</div>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{info.categoryTone}</p>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          {specialties.map((specialty) => (
                            <Badge key={specialty} variant="outline" className="border-white/15 bg-white/5 text-slate-200">
                              {specialty}
                            </Badge>
                          ))}
                        </div>

                        <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                          <div className="font-semibold text-white">Media status</div>
                          <p className="mt-2">{isLiveTrainrImage(visual) ? `Live asset in use — ${visual.tone}.` : `${visual.label} — ${visual.status}.`}</p>
                          <p className="mt-2 text-slate-400">{info.trustNote}</p>
                        </div>
                      </div>

                      <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-4 md:p-5">
                        <div className="text-sm font-semibold text-white">What your athlete can work on</div>
                        <ul className="mt-4 space-y-3 text-sm text-slate-300">
                          {info.benefits.map((benefit) => (
                            <li key={benefit} className="flex gap-2">
                              <Trophy className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                              <span>{benefit}</span>
                            </li>
                          ))}
                        </ul>

                        <Link href={`/browse?sport=${sport.slug}`} className="mt-6 block">
                          <Button className="w-full rounded-2xl border-0 bg-white text-emerald-900 hover:bg-emerald-50">
                            <Search className="mr-2 h-4 w-4" />
                            Find {sport.name} trainers
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </div>
              </Card>
            )
          })}
        </div>
      </section>
    </div>
  )
}
