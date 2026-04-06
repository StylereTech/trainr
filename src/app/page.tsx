import Link from 'next/link'
import Image from 'next/image'
import { ArrowRight, Shield, Star, Clock, Users, CheckCircle2, Trophy, ChevronRight, ClipboardList, CalendarDays, Quote, Search, HeartHandshake, PlayCircle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { SPORTS } from '@/lib/utils'
import { getSportVisual, isLiveTrainrImage, TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'

const stats = [
  { value: '500+', label: 'Vetted Trainers' },
  { value: '5,000+', label: 'Sessions Completed' },
  { value: '4.9', label: 'Average Rating' },
  { value: '5', label: 'Sports Covered' },
]

const trustBadges = [
  { icon: Shield, text: 'Background Verified' },
  { icon: CheckCircle2, text: 'Certified Trainers' },
  { icon: Star, text: 'Parent Reviews' },
  { icon: Clock, text: 'Flexible Scheduling' },
]

const howItWorks = [
  {
    step: '01',
    icon: Search,
    title: 'Find the right coach',
    description: 'Search by sport, location, and specialty. Read real parent reviews. Pick someone your kid will actually want to train with.',
  },
  {
    step: '02',
    icon: ClipboardList,
    title: 'Book and pay',
    description: "Choose a time, share your athlete's goals, and pay securely. The whole thing takes about two minutes.",
  },
  {
    step: '03',
    icon: Trophy,
    title: 'Watch them improve',
    description: 'Great coaches build confidence fast. Rebook the ones that click and watch your athlete grow.',
  },
]

const familyDecisionPoints = [
  {
    icon: Shield,
    title: 'Coaches you can trust',
    text: 'Every trainer has a verified profile with real reviews, credentials, and coaching background you can check before booking.',
  },
  {
    icon: CalendarDays,
    title: 'Pricing up front',
    text: 'See exactly what a session costs, how long it lasts, and when the trainer is available. No surprises at checkout.',
  },
  {
    icon: Users,
    title: 'Made for busy parents',
    text: 'Search, book, and pay from your phone in minutes. Manage multiple kids and sports in one place.',
  },
]

const testimonials = [
  {
    name: 'Sarah M.',
    role: 'Parent',
    text: "My son's quarterback skills improved dramatically after just four sessions. The trainer was professional and incredible with kids.",
    sport: '🏈 Football',
    rating: 5,
  },
  {
    name: 'David R.',
    role: 'Parent',
    text: 'Finally found a pitching coach who actually understands youth mechanics. Worth every penny.',
    sport: '⚾ Baseball',
    rating: 5,
  },
  {
    name: 'Lisa K.',
    role: 'Parent',
    text: "The booking flow is clean and easy. I can manage both kids' training schedules without the usual chaos.",
    sport: '🏀 Basketball',
    rating: 5,
  },
]

const homepageSignals = [
  'Coaches across 5 youth sports',
  'Verified reviews from real parents',
  'Secure payments through Stripe',
]

export default function HomePage() {
  return (
    <>
      <section className="site-hero min-h-[80vh] md:min-h-[calc(100vh-72px)] border-b border-white/10 text-white">
        <Image
          src="/images/trainr/custom/home-hero-logo.jpg"
          alt="Trainr youth sports hero featuring athletes and the Trainr logo"
          fill
          priority
          className="object-cover object-top"
        />
        <div className="hero-overlay" />
        <div className="hero-mesh" />

        <div className="container relative flex min-h-[80vh] md:min-h-[calc(100vh-72px)] items-end py-12 md:py-16 lg:py-20">
          <div className="grid w-full gap-8 overflow-hidden lg:grid-cols-[1.05fr_.95fr] lg:items-end lg:gap-10">
            <div className="min-w-0 max-w-3xl overflow-hidden">
              <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-2 backdrop-blur-xl sm:px-4">
                <HeartHandshake className="h-4 w-4 shrink-0 text-emerald-300" />
                <span className="min-w-0 text-sm leading-5 text-slate-100">Trusted coaching for growing athletes</span>
              </div>

              <div className="mt-5 grid max-w-full gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-200 sm:flex sm:flex-wrap sm:text-xs sm:tracking-[0.2em]">
                <span className="max-w-full rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center sm:text-left">Family-first experience</span>
                <span className="max-w-full rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center sm:text-left">Trusted youth coaches</span>
                <span className="max-w-full rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-center sm:text-left">Simple path to booking</span>
              </div>

              <h1 className="mt-6 max-w-[11.5ch] text-[2.6rem] font-bold leading-[0.95] tracking-[-0.06em] sm:max-w-4xl sm:text-5xl md:text-6xl xl:text-7xl">
                Find a coach your athlete connects with,
                <span className="mt-2 block text-gradient">and book their first session today.</span>
              </h1>
              <p className="mt-5 max-w-xl text-base leading-7 text-slate-200 md:max-w-2xl md:text-xl">
                Vetted youth trainers in football, baseball, basketball, soccer, and track &amp; field. Check their reviews, pick a time, and pay — all in one place.
              </p>

              <div className="mt-8 flex max-w-full flex-col gap-3 sm:flex-row">
                <Link href="/browse">
                  <Button size="lg" className="h-12 w-full border-0 bg-white px-8 font-semibold text-emerald-900 hover:bg-emerald-50 sm:w-auto">
                    Find Trainers
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/how-it-works">
                  <Button size="lg" variant="outline" className="h-12 w-full border-white/20 bg-white/5 px-8 text-white hover:bg-white/10 hover:text-white sm:w-auto">
                    How It Works
                    <PlayCircle className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="mt-8 mobile-scroll-row sm:grid-cols-3">
                {[
                  'Background-checked coaches',
                  'Real reviews from real parents',
                  'Book and pay in minutes',
                ].map((signal) => (
                  <div key={signal} className="mobile-scroll-card rounded-[1.4rem] border border-white/10 bg-black/25 px-4 py-4 text-sm text-slate-200 backdrop-blur-xl">
                    <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-300" />
                    {signal}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 lg:justify-end">
              <div className="premium-shell max-w-xl p-5 md:p-6">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Start with your athlete's sport</div>
                <div className="mt-4 mobile-scroll-row sm:grid-cols-2 lg:grid-cols-1">
                  {SPORTS.map((sport) => (
                    <Link key={sport.slug} href={`/browse?sport=${sport.slug}`} className="mobile-scroll-card">
                      <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white transition hover:bg-white/[0.08]">
                        <span>{sport.icon} {sport.name}</span>
                        <ChevronRight className="h-4 w-4 text-emerald-300" />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="premium-stat bg-black/25">
                    <div className="text-2xl font-semibold text-white md:text-3xl">{stat.value}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow bg-slate-950 py-5 md:py-6">
        <div className="container">
          <div className="flex flex-wrap justify-center gap-5 md:gap-10">
            {trustBadges.map((badge) => (
              <div key={badge.text} className="flex items-center gap-2 text-sm text-slate-300">
                <badge.icon className="h-5 w-5 text-emerald-300" />
                <span className="font-medium">{badge.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-flow bg-slate-950 text-white">
        <div className="content-grid">
          <div className="grid items-center gap-10 lg:grid-cols-[1.02fr_.98fr]">
            <div>
              <div className="premium-kicker">Why parents choose Trainr</div>
              <h2 className="mt-5 text-3xl font-bold tracking-tight md:text-5xl">Stop guessing. Start with coaches other parents already trust.</h2>
              <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
                Every coach on Trainr has a real profile with verified reviews, clear pricing, and available time slots. You see what you need to make a decision before you ever pull out your card.
              </p>
              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                {familyDecisionPoints.map((item) => (
                  <Card key={item.title} className="premium-card border-white/10 bg-white/[0.04] text-white">
                    <CardContent className="p-5">
                      <item.icon className="mb-3 h-5 w-5 text-emerald-300" />
                      <h3 className="font-semibold">{item.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-300">{item.text}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="premium-shell p-0">
              <div className="relative min-h-[320px] overflow-hidden rounded-[2rem] md:min-h-[520px]">
                <Image
                  src="/images/trainr/custom/basketball-coaching.jpg"
                  alt="Youth basketball player practicing shooting form with coach"
                  fill
                  className="object-cover"
                />
                <div className="hero-overlay" />
                <div className="absolute left-5 top-5 rounded-full border border-white/15 bg-black/35 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-white backdrop-blur-xl">Basketball</div>
                <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                  <div className="premium-panel p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-white"><Sparkles className="h-4 w-4 text-emerald-300" /> Real coaches, real results</div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">Parents book trainers who specialize in their kid&apos;s sport. Coaches build lasting relationships with families who keep coming back.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow bg-slate-950 py-16 text-white md:py-24">
        <div className="container">
          <div className="mb-10 flex flex-col gap-4 text-center lg:flex-row lg:items-end lg:justify-between lg:text-left">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Browse by sport</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">Five sports. Hundreds of coaches. One place to find them.</h2>
              <p className="mt-3 text-slate-300">Pick your athlete&apos;s sport and see who&apos;s available near you.</p>
            </div>
            <Link href="/sports" className="inline-flex items-center justify-center text-sm font-medium text-emerald-300">
              View all sport categories <ChevronRight className="ml-1 h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {SPORTS.map((sport) => {
              const visual = getSportVisual(sport.slug)
              return (
                <Link key={sport.slug} href={`/browse?sport=${sport.slug}`}>
                  <Card className="group h-full overflow-hidden rounded-[1.8rem] border-white/10 bg-white/[0.04] text-white transition duration-300 hover:-translate-y-1 hover:border-emerald-400/30">
                    <div className="relative h-56">
                      {isLiveTrainrImage(visual) ? (
                        <Image src={visual.src} alt={visual.alt} fill className="object-contain transition duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.28),_transparent_36%),linear-gradient(160deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.03))]" />
                      )}
                      <div className="image-wash" />
                      <div className="absolute inset-x-0 bottom-0 p-4">
                        <div className="rounded-2xl border border-white/10 bg-slate-950/65 px-3 py-2 text-sm text-slate-100 backdrop-blur">{visual.tone}</div>
                      </div>
                    </div>
                    <CardContent className="p-5">
                      <div className="text-lg font-semibold">{sport.icon} {sport.name}</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">Find {sport.name.toLowerCase()} coaches near you</p>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      <section className="section-flow bg-slate-950 py-16 text-white md:py-24">
        <div className="container">
          <div className="mb-12 flex flex-col gap-4 text-center lg:flex-row lg:items-end lg:justify-between lg:text-left">
            <div className="max-w-2xl">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">How it works</div>
              <h2 className="mt-3 text-3xl font-bold tracking-tight">Search. Book. Train.</h2>
              <p className="mt-3 text-slate-300">Three steps from browsing coaches to your kid&apos;s first session.</p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-slate-200">
              <HeartHandshake className="h-4 w-4 text-emerald-300" />
              Built for busy families
            </div>
          </div>
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {howItWorks.map((item) => (
              <Card key={item.step} className="premium-card border-white/10 bg-white/[0.04] text-white">
                <CardContent className="p-6 text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary">
                    <item.icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="mb-2 text-xs font-bold tracking-[0.24em] text-emerald-300">STEP {item.step}</div>
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-flow bg-slate-950 py-16 text-white md:py-24">
        <div className="container">
          <div className="mb-12 text-center">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-300">Parent proof</div>
            <h2 className="mt-3 mb-3 text-3xl font-bold tracking-tight">What families say after the first few sessions.</h2>
            <p className="text-slate-300">Real feedback from parents who booked through Trainr.</p>
          </div>
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-3">
            {testimonials.map((t, i) => (
              <Card key={i} className="h-full rounded-[1.8rem] border border-white/10 bg-white/[0.04] shadow-sm text-white">
                <CardContent className="p-6">
                  <Quote className="mb-4 h-6 w-6 text-emerald-300/50" />
                  <div className="mb-3 flex items-center gap-1">
                    {Array.from({ length: t.rating }).map((_, j) => (
                      <Star key={j} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    ))}
                  </div>
                  <p className="mb-5 text-sm leading-7 text-slate-200">&ldquo;{t.text}&rdquo;</p>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-slate-400">{t.role}</div>
                    </div>
                    <Badge variant="secondary" className="text-xs bg-white/10 text-white hover:bg-white/10">{t.sport}</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-flow bg-slate-950 pb-8 pt-16 text-white md:pb-12 md:pt-24">
        <div className="container">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10">
            <Image
              src="/images/trainr/football-hero.jpg"
              alt="Youth football athletes running a coached agility drill on turf"
              fill
              className="object-cover"
            />
            <div className="hero-overlay" />
            <div className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl">Are you a sports trainer?</h2>
              <p className="mx-auto mb-8 max-w-2xl text-slate-200 leading-7">
                Set your own rates, pick your own hours, and get booked by families who are already looking for what you do.
              </p>
              <div className="flex flex-col gap-4 sm:flex-row sm:justify-center">
                <Link href="/auth/signup?role=trainer">
                  <Button size="lg" className="w-full bg-white px-8 font-semibold text-green-800 hover:bg-green-50 sm:w-auto">
                    Apply as a Trainer
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/for-trainers">
                  <Button size="lg" variant="outline" className="w-full border-white/30 px-8 text-white hover:bg-white/10 sm:w-auto">
                    Learn More
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-950 py-10 md:py-12">
        <div className="container grid gap-3 md:grid-cols-3">
          {homepageSignals.map((signal) => (
            <div key={signal} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-200">
              <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-300" />
              {signal}
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
