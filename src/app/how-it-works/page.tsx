import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Search, Calendar, Star, CreditCard, MessageSquare, Shield, CheckCircle2, Sparkles, Users, Trophy, ClipboardList } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'How It Works',
  description: 'Learn how Trainr connects parents with vetted youth sports trainers in three simple steps.',
}

const steps = [
  {
    number: '1',
    icon: Search,
    title: 'Shortlist the right coach',
    description: 'Filter by sport, location, session type, and rating. Read real parent reviews and compare coaches until you find the right one.',
    details: [
      'Filter by sport, specialty, and location',
      'Read verified parent reviews',
      'Compare coaching style and price point',
      'Review credentials and training background',
    ],
    image: '/images/trainr/custom/football-stretching.jpg',
    imageAlt: 'Coach leading youth athletes through warm-up and training drills',
  },
  {
    number: '2',
    icon: Calendar,
    title: 'Book with context',
    description: 'Pick a time that works, add your athlete\'s goals, and pay securely through Stripe. Done in under two minutes.',
    details: [
      'Real-time availability',
      'Private sessions or packages',
      'Athlete goals included at booking',
      'Streamlined checkout and confirmations',
    ],
    image: null,
    imageAlt: '',
  },
  {
    number: '3',
    icon: Star,
    title: 'Train, review, and build momentum',
    description: 'Your athlete shows up ready, the coach already knows their goals. Leave a review and rebook the coaches that click.',
    details: [
      'Clear communication before the session starts',
      'Message your trainer through the platform',
      'Leave detailed parent feedback after training',
      'Rebook for consistency and measurable progress',
    ],
    image: '/images/trainr/custom/pushups-coaching.jpg',
    imageAlt: 'Coach guiding youth athlete through strength and conditioning',
  },
]

const familyJourney = [
  {
    icon: Users,
    title: 'For busy parents',
    text: 'Search, compare, and book from your phone. Manage multiple kids and sports without the back-and-forth.',
  },
  {
    icon: ClipboardList,
    title: 'For athletes with goals',
    text: 'Share what your kid is working on before the session starts so the coach shows up with a plan.',
  },
  {
    icon: Trophy,
    title: 'For long-term growth',
    text: 'One session can change everything. Rebook the coaches that work and track your athlete\'s progress over time.',
  },
]

const features = [
  { icon: Shield, title: 'Vetted trainers', description: 'Every coach has a verified profile with credentials, experience, and reviews from other parents.' },
  { icon: CreditCard, title: 'Secure payments', description: 'Pay through Stripe at checkout. Your card info is never stored on our servers.' },
  { icon: MessageSquare, title: 'In-app messaging', description: 'Message your coach directly through Trainr. No need for phone numbers or side threads.' },
  { icon: Star, title: 'Honest reviews', description: 'Only parents who completed a session can leave a review. No fake ratings.' },
]

const reassurance = [
  'No long-term commitments required',
  'Verified coaches with real parent reviews',
  'Secure payments through Stripe',
]

export default function HowItWorksPage() {
  return (
    <div className="bg-slate-950 text-white">
      <section className="site-hero min-h-[calc(100vh-72px)] border-b border-white/10 text-white">
        <Image src="/images/trainr/custom/indoor-training.jpg" alt="Youth athletes training inside a professional sports facility" fill priority className="object-cover object-center" />
        <div className="hero-overlay" />
        <div className="hero-mesh" />
        <div className="container relative flex min-h-[calc(100vh-72px)] items-end py-12 md:py-16 lg:py-20">
          <div className="grid w-full gap-8 lg:grid-cols-[1.02fr_.98fr] lg:items-end lg:gap-10">
            <div className="max-w-3xl">
              <Badge className="mb-4 border-white/20 bg-white/10 text-white hover:bg-white/10">Simple booking, real results</Badge>
              <h1 className="text-4xl font-bold tracking-[-0.05em] md:text-6xl">How Trainr works for your family.</h1>
              <p className="mt-5 max-w-2xl text-lg text-slate-200 md:text-xl">
                Find a coach, book a session, and watch your athlete improve. The whole process takes a few minutes.
              </p>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {reassurance.map((item) => (
                  <div key={item} className="rounded-2xl border border-white/10 bg-black/15 p-4 text-left shadow-sm backdrop-blur-xl">
                    <CheckCircle2 className="mb-2 h-4 w-4 text-emerald-300" />
                    <p className="text-sm text-slate-200">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="premium-shell max-w-xl justify-self-end p-5 md:p-6">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Family journey snapshot</div>
              <div className="mt-4 space-y-3">
                {['Browse coaches by sport and location', 'Book and pay in minutes', 'Rebook the coaches your kid loves'].map((item, index) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-emerald-500/20 text-sm font-semibold text-emerald-200">0{index + 1}</div>
                    <span className="text-sm text-slate-200">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow py-14 md:py-20">
        <div className="container max-w-6xl space-y-8">
          {steps.map((step, index) => (
            <Card key={step.number} className="overflow-hidden border-white/10 bg-white/[0.04] text-white shadow-sm">
              <div className={`grid ${step.image ? 'lg:grid-cols-[1fr_.45fr]' : ''} ${index % 2 === 1 && step.image ? 'lg:[&>*:first-child]:order-2' : ''}`}>
                <CardContent className="p-6 md:p-8">
                  <div className="flex items-center gap-4 md:block">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary">
                      <step.icon className="h-8 w-8 text-white" />
                    </div>
                    <span className="mt-4 hidden text-5xl font-bold text-white/10 md:block">0{step.number}</span>
                  </div>
                  <div className="mt-4">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Step {step.number}
                    </div>
                    <h2 className="mb-2 text-2xl font-bold">{step.title}</h2>
                    <p className="mb-5 text-slate-300">{step.description}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {step.details.map((detail) => (
                        <div key={detail} className="flex items-start gap-2 rounded-2xl border border-white/10 bg-slate-950/50 p-4 text-sm text-slate-300">
                          <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                          {detail}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
                {step.image && (
                  <div className="relative hidden min-h-[300px] lg:block">
                    <Image src={step.image} alt={step.imageAlt} fill className="object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-slate-950/40 to-transparent" />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="section-flow py-16 md:py-20">
        <div className="container grid items-center gap-10 lg:grid-cols-[.95fr_1.05fr]">
          <div className="premium-shell order-2 p-0 lg:order-1">
            <div className="relative min-h-[320px] overflow-hidden rounded-[2rem] md:min-h-[440px]">
              <Image src="/images/trainr/custom/basketball-group.jpg" alt="Group of kids training together during basketball coaching session" fill className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                <div className="premium-panel p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white"><Trophy className="h-4 w-4 text-emerald-300" /> Coaching that sticks</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Great coaching builds confidence. Rebook the coaches that click and watch your athlete grow session after session.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <Badge className="mb-4 border-white/15 bg-white/5 text-white hover:bg-white/5"><Sparkles className="mr-1 h-3.5 w-3.5" /> The family journey</Badge>
            <h2 className="text-3xl font-bold md:text-4xl">Built around how real families choose the right coach.</h2>
            <div className="mt-6 space-y-4">
              {familyJourney.map((item) => (
                <div key={item.title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-sm">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-400/10">
                    <item.icon className="h-5 w-5 text-emerald-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                    <p className="mt-1 text-sm text-slate-300">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow py-16">
        <div className="container">
          <h2 className="mb-8 text-center text-3xl font-bold md:text-4xl">Why parents trust Trainr</h2>
          <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="h-full border-white/10 bg-white/[0.04] text-center text-white shadow-sm">
                <CardContent className="p-6">
                  <div className="mx-auto mb-4 inline-flex rounded-2xl bg-emerald-400/10 p-3">
                    <feature.icon className="h-6 w-6 text-emerald-300" />
                  </div>
                  <h3 className="mb-1 font-semibold">{feature.title}</h3>
                  <p className="text-sm text-slate-300">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-flow pb-16 pt-10">
        <div className="container">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10">
            <Image src="/images/trainr/custom/football-camp.jpg" alt="Youth football training camp with coaches and young athletes" fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-slate-950/30" />
            <div className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl">Ready to find your trainer?</h2>
              <p className="mx-auto mb-8 max-w-lg text-slate-200">Browse trusted coaches, compare the right fit, and book that first session with more confidence.</p>
              <Link href="/browse">
                <Button size="lg" className="bg-white px-8 font-semibold text-green-800 hover:bg-green-50">
                  Browse Trainers <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
