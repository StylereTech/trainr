import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { ArrowRight, Search, Sparkles, Trophy, ShieldCheck, CheckCircle2, Layers3, Medal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SPORTS, SPECIALTIES } from '@/lib/utils'
import { getSportImageSrc, getSportImageAlt } from '@/lib/trainr-media'

export const metadata: Metadata = {
  title: 'Sports',
  description: 'Browse youth sports trainers across football, baseball, basketball, soccer, and track & field.',
}

const sportDescriptions: Record<string, { tagline: string; description: string; benefits: string[]; developmentFocus: string; trustNote: string; categoryTone: string }> = {
  football: {
    tagline: 'Football Training',
    description: 'Quarterback mechanics, defensive fundamentals, speed work, and combine prep. Find a football coach who develops your athlete\'s position skills and confidence.',
    benefits: ['Position-specific drills', 'Speed & agility work', 'Film study prep', 'Combine preparation'],
    developmentFocus: 'Great for athletes building explosiveness, confidence, and football IQ at any position.',
    trustNote: 'Coaches verified with background checks and parent reviews.',
    categoryTone: 'Explosive, disciplined, and built for game-day confidence.',
  },
  baseball: {
    tagline: 'Baseball Coaching',
    description: 'Hitting, pitching, catching, and fielding. Work with coaches who understand youth mechanics and know how to develop players the right way.',
    benefits: ['Hitting mechanics', 'Pitching velocity & command', 'Catching techniques', 'Defensive fundamentals'],
    developmentFocus: 'Perfect for athletes who want to sharpen their mechanics without rushing their development.',
    trustNote: 'Coaches verified with background checks and parent reviews.',
    categoryTone: 'Technical, patient, and focused on long-term player growth.',
  },
  basketball: {
    tagline: 'Basketball Training',
    description: 'Shooting, ball handling, footwork, and game IQ. Find basketball trainers who help your athlete become a more complete player.',
    benefits: ['Shooting form & accuracy', 'Ball handling & dribbling', 'Defensive positioning', 'Game situation training'],
    developmentFocus: 'Great for guards, wings, and youth players building confidence under pressure.',
    trustNote: 'Coaches verified with background checks and parent reviews.',
    categoryTone: 'Fast-paced, confidence-building, and game-ready.',
  },
  soccer: {
    tagline: 'Soccer Training',
    description: 'Strikers to goalkeepers. Find soccer trainers who develop technique, movement, and decision-making for your athlete\'s position.',
    benefits: ['Ball control & dribbling', 'Passing & receiving', 'Position-specific training', 'Speed & conditioning'],
    developmentFocus: 'Built for athletes focused on technical repetition and tactical awareness.',
    trustNote: 'Coaches verified with background checks and parent reviews.',
    categoryTone: 'Technical, fluid, and focused on movement quality.',
  },
  'track-field': {
    tagline: 'Track & Field Coaching',
    description: 'Sprints, jumps, throws, hurdles, and distance. Specialized coaches for every event who focus on mechanics and measurable improvement.',
    benefits: ['Sprint mechanics', 'Hurdle technique', 'Jump form & distance', 'Throwing fundamentals'],
    developmentFocus: 'Best for athletes who want disciplined coaching and measurable progress in their event.',
    trustNote: 'Coaches verified with background checks and parent reviews.',
    categoryTone: 'Precise, disciplined, and results-driven.',
  },
}

const categoryHighlights = [
  { icon: ShieldCheck, title: 'Vetted coaches', description: 'Every trainer is reviewed by parents and verified before they can accept bookings.' },
  { icon: Sparkles, title: 'Sport-specific training', description: 'Coaches specialize in your athlete\'s sport with drills, skills, and development plans that match their level.' },
  { icon: Trophy, title: 'Clear expectations', description: 'See what each coach offers, what it costs, and what your kid will work on before you book.' },
]

const consistencySignals = ['5 youth sports covered', 'Coaches across the country', 'Book your first session today']

export default function SportsPage() {
  return (
    <div className="bg-slate-950 text-white">
      <section className="site-hero border-b border-white/10 bg-gradient-to-br from-slate-950 via-emerald-950/40 to-slate-950">
        <div className="hero-mesh" />
        <div className="container relative py-12 md:py-20">
          <div className="flex flex-col items-center gap-8 lg:flex-row lg:items-center lg:gap-12">
            <div className="max-w-2xl flex-1">
              <div className="premium-kicker mb-5">
                <Layers3 className="h-4 w-4" /> Browse by sport
              </div>
              <h1 className="text-4xl font-semibold tracking-[-0.04em] md:text-6xl">Pick a sport. Find a coach your kid will love.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Football, baseball, basketball, soccer, and track &amp; field. Each sport has coaches who specialize in youth development at every level.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-sm text-slate-200">
                <span className="rounded-full border border-white/10 bg-black/25 px-4 py-2 backdrop-blur-xl">5 youth sports</span>
                <span className="rounded-full border border-white/10 bg-black/25 px-4 py-2 backdrop-blur-xl">Coaches at every skill level</span>
                <span className="rounded-full border border-white/10 bg-black/25 px-4 py-2 backdrop-blur-xl">Book in minutes</span>
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
            <div className="hidden flex-shrink-0 lg:block">
              <Image
                src="/images/trainr/custom/trainr-shield-logo.png"
                alt="Trainr multi-sport shield logo"
                width={380}
                height={380}
                priority
                className="drop-shadow-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-12 md:py-16">
        <div className="container">
          <div className="grid items-center gap-8 lg:grid-cols-[.55fr_.45fr]">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Every sport covered</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Specialized coaching for every sport your kid plays.</h2>
              <p className="mt-4 max-w-xl text-slate-300">Whether they&apos;re just starting out or training for varsity, there&apos;s a coach on Trainr who focuses on exactly what they need.</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                {categoryHighlights.map((item) => (
                  <Card key={item.title} className="border-white/10 bg-white/[0.05] text-white">
                    <CardContent className="p-5">
                      <item.icon className="h-5 w-5 text-emerald-300" />
                      <h3 className="mt-4 font-semibold">{item.title}</h3>
                      <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
            <div className="relative overflow-hidden rounded-[2rem] border border-white/10">
              <div className="relative h-[360px] md:h-[420px]">
                <Image
                  src="/images/trainr/custom/sports-right.jpg"
                  alt="Coach leading youth athletes through stretching and warm-up drills"
                  fill
                  className="object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                  <div className="premium-panel p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-emerald-300" /> Youth-focused development</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Coaches who specialize in building young athletes the right way — one skill at a time.</p>
                  </div>
                </div>
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
            const imageSrc = getSportImageSrc(sport.slug)
            const imageAlt = getSportImageAlt(sport.slug)

            return (
              <Card key={sport.slug} className="overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.04] text-white shadow-xl">
                <div className={`grid lg:grid-cols-[.42fr_.58fr] ${index % 2 === 1 ? 'lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1' : ''}`}>
                  <div className={`relative min-h-[280px] border-b border-white/10 lg:min-h-full lg:border-b-0 ${index % 2 === 1 ? 'lg:border-l' : 'lg:border-r'}`}>
                    <Image
                      src={imageSrc}
                      alt={imageAlt}
                      fill
                      className="object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/25 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                      <Badge className="border border-white/15 bg-slate-950/60 text-white hover:bg-slate-950/60">
                        {sport.name}
                      </Badge>
                      <h2 className="mt-3 text-2xl font-semibold md:text-3xl">{info.tagline}</h2>
                    </div>
                  </div>

                  <CardContent className="p-5 md:p-8">
                    <p className="text-sm leading-7 text-slate-300 md:text-base">{info.description}</p>

                    <div className="mt-6 grid gap-5 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Development focus</div>
                        <p className="mt-3 text-sm leading-6 text-slate-300">{info.developmentFocus}</p>

                        <div className="mt-4 rounded-[1.5rem] border border-white/10 bg-slate-950/40 p-4">
                          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Medal className="h-4 w-4 text-emerald-300" /> Training style</div>
                          <p className="mt-2 text-sm leading-6 text-slate-300">{info.categoryTone}</p>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-2">
                          {specialties.map((specialty) => (
                            <Badge key={specialty} variant="outline" className="border-white/15 bg-white/5 text-slate-200">
                              {specialty}
                            </Badge>
                          ))}
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
