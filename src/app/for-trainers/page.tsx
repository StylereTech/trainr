import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Star, Calendar, DollarSign, Users, Zap, ShieldCheck, Sparkles, CheckCircle2, Clock3, LayoutDashboard, HandCoins } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'For Trainers',
  description: 'Grow your coaching business on Trainr. Set your rates, manage your schedule, and focus on coaching.',
}

const benefits = [
  { icon: DollarSign, title: 'Set your own rates', description: 'Offer private sessions, groups, virtual coaching, or packages with full pricing control.' },
  { icon: Calendar, title: 'Control your schedule', description: 'Open only the slots you want to coach and keep your calendar aligned with real demand.' },
  { icon: Users, title: 'Reach serious families', description: 'Get discovered by parents already looking for trustworthy youth development.' },
  { icon: Zap, title: 'Fast payout flow', description: 'Move from booking to payout through a cleaner Stripe-powered system.' },
  { icon: Star, title: 'Build social proof', description: 'Verified reviews compound trust and make conversion easier over time.' },
  { icon: CheckCircle2, title: 'Low-friction launch', description: 'No upfront fees, no subscription pressure, and no messy setup before you start.' },
]

const trainerSteps = [
  {
    title: 'Build a profile families trust',
    description: 'Add sports, specialties, credentials, and a clear coaching philosophy so families understand your value fast.',
  },
  {
    title: 'Publish offers that sell cleanly',
    description: 'Create one-on-one sessions, groups, virtual consults, and packages with transparent pricing.',
  },
  {
    title: 'Turn trust into repeat business',
    description: 'Use reviews, polished scheduling, and strong presentation to turn first bookings into long-term relationships.',
  },
]

const operatingPoints = [
  { icon: LayoutDashboard, title: 'One dashboard', text: 'Your schedule, bookings, messages, and payouts all in one place.' },
  { icon: ShieldCheck, title: 'Look professional', text: 'Your profile shows credentials, reviews, and session options so parents trust you from the start.' },
  { icon: HandCoins, title: 'Know what you earn', text: 'You keep 85% of every booking. No hidden fees, no surprises.' },
]

const growthSignals = [
  'Private sessions, groups, and packages supported',
  'Review-backed reputation growth over time',
  'Flexible local and virtual coaching options',
  'No subscription required to apply',
]

export default function ForTrainersPage() {
  return (
    <div className="bg-slate-950 text-white">
      <section className="site-hero min-h-[calc(100vh-72px)] border-b border-white/10 text-white">
        <Image src="/images/trainr/custom/football-camp.jpg" alt="Coaches working with young athletes at a football training camp" fill priority className="object-cover" />
        <div className="hero-overlay" />
        <div className="hero-mesh" />
        <div className="container relative flex min-h-[calc(100vh-72px)] items-end py-12 md:py-16 lg:py-20">
          <div className="grid w-full gap-8 lg:grid-cols-[1.02fr_.98fr] lg:gap-10">
            <div className="max-w-3xl">
              <Badge className="mb-4 border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">For Trainers</Badge>
              <h1 className="text-4xl font-bold tracking-[-0.05em] md:text-6xl">A better home for coaches who want serious families.</h1>
              <p className="mt-5 max-w-2xl text-lg text-slate-200 md:text-xl">
                Set your rates, control your schedule, and let families find you. Trainr handles the booking, payments, and reviews so you can focus on coaching.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link href="/auth/signup?role=trainer">
                  <Button size="lg" className="w-full bg-white px-8 font-semibold text-green-800 hover:bg-green-50 sm:w-auto">
                    Apply Now — It&apos;s Free <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/browse">
                  <Button size="lg" variant="outline" className="w-full border-white/20 bg-transparent px-8 text-white hover:bg-white/10 hover:text-white sm:w-auto">
                    See the marketplace
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid gap-4 lg:justify-end">
              <div className="premium-shell max-w-xl p-5 md:p-6">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Why families respond better here</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  {operatingPoints.map((point) => (
                    <div key={point.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <point.icon className="mb-3 h-5 w-5 text-emerald-300" />
                      <h3 className="text-sm font-semibold">{point.title}</h3>
                      <p className="mt-2 text-sm text-slate-300">{point.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow py-16 md:py-20">
        <div className="container">
          <div className="mb-10 max-w-2xl">
            <h2 className="text-3xl font-bold md:text-4xl">Why strong coaches choose Trainr</h2>
            <p className="mt-3 text-slate-300">Everything you need to get booked, get paid, and grow your coaching business.</p>
          </div>
          <div className="grid max-w-6xl gap-6 md:grid-cols-2 lg:grid-cols-3">
            {benefits.map((benefit, index) => (
              <Card key={index} className="h-full border-white/10 bg-white/[0.04] text-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="p-6">
                  <div className="mb-4 inline-flex rounded-2xl bg-emerald-400/10 p-3">
                    <benefit.icon className="h-6 w-6 text-emerald-300" />
                  </div>
                  <h3 className="mb-2 font-semibold">{benefit.title}</h3>
                  <p className="text-sm text-slate-300">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-flow py-16 md:py-20">
        <div className="container grid items-center gap-10 lg:grid-cols-[.92fr_1.08fr]">
          <div className="premium-shell p-0">
            <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] md:min-h-[520px]">
              <Image src="/images/trainr/custom/for-trainers-left.jpg" alt="Coach leading youth athletes through training" fill className="object-contain" style={{ objectPosition: 'center top' }} />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-5 md:p-6">
                <div className="premium-panel p-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white"><Star className="h-4 w-4 text-emerald-300" /> Build your reputation</div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">Every great session earns a review. Reviews build trust. Trust fills your calendar.</p>
                </div>
              </div>
            </div>
          </div>
          <div>
            <Badge className="mb-4 border-white/15 bg-white/5 text-white hover:bg-white/5"><Sparkles className="mr-1 h-3.5 w-3.5" /> How strong profiles win trust</Badge>
            <h2 className="text-3xl font-bold md:text-4xl">From first impression to repeat bookings, everything should read clearly.</h2>
            <div className="mt-6 space-y-4">
              {trainerSteps.map((step, index) => (
                <div key={step.title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-sm">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 font-bold text-white">0{index + 1}</div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">{step.title}</h3>
                    <p className="mt-1 text-sm text-slate-300">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow py-16 md:py-20">
        <div className="container grid gap-6 lg:grid-cols-[1.05fr_.95fr]">
          <Card className="border-white/10 bg-white/[0.04] text-white shadow-lg">
            <CardContent className="p-6 md:p-8">
              <Badge className="mb-4 border-white/15 bg-white/5 text-white hover:bg-white/5"><ShieldCheck className="mr-1 h-3.5 w-3.5" /> Transparent economics</Badge>
              <h2 className="text-3xl font-bold">Know what you keep on every booking</h2>
              <p className="mt-3 text-sm text-slate-300">Families get a smooth checkout experience. Trainers get simple math and predictable platform economics.</p>
              <div className="mt-6 space-y-4 rounded-[1.5rem] border border-white/10 bg-slate-950/50 p-5">
                <div className="flex items-center justify-between border-b border-white/10 py-3">
                  <span className="text-sm">Session Price</span>
                  <span className="font-semibold">$75.00</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/10 py-3">
                  <span className="text-sm text-rose-300">Platform Fee (15%)</span>
                  <span className="font-semibold text-rose-300">−$11.25</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/10 py-3">
                  <span className="text-sm text-rose-300">Processing Fee</span>
                  <span className="font-semibold text-rose-300">−$2.48</span>
                </div>
                <div className="flex items-center justify-between py-3">
                  <span className="font-bold">You Earn</span>
                  <span className="text-xl font-bold text-emerald-300">$61.27</span>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-400">Based on a $75 individual session. Stripe processing fee is 2.9% + $0.30.</p>
            </CardContent>
          </Card>

          <div className="grid gap-6">
            <Card className="border-white/10 bg-white/[0.04] text-white shadow-sm">
              <CardContent className="p-6 md:p-8">
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">What makes the platform feel trustworthy</div>
                <div className="mt-6 space-y-4">
                  {growthSignals.map((signal) => (
                    <div key={signal} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                      <span className="text-sm text-slate-200">{signal}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-[1.5rem] bg-slate-950 p-5 text-white">
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Clock3 className="h-4 w-4" /> Getting started is free</div>
                  <p className="mt-2 text-sm text-slate-300">Create your profile, publish your services, and start accepting bookings. You only pay the platform fee when you get paid.</p>
                </div>
              </CardContent>
            </Card>

            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900/60">
              <div className="relative p-6">
                <p className="text-sm font-semibold text-white">Join 500+ coaches already on the platform</p>
                <p className="mt-2 text-sm text-slate-300">Trainers across all five sports are building real businesses through Trainr.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow pb-16 pt-10 md:pb-20">
        <div className="container">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/60">
            <div className="relative p-8 text-center md:p-12">
              <h2 className="mb-4 text-3xl font-bold md:text-4xl">Ready to coach on Trainr?</h2>
              <p className="mx-auto mb-8 max-w-2xl text-slate-200">Create your free profile, publish offers, and start attracting families who are already looking for trusted youth coaching.</p>
              <Link href="/auth/signup?role=trainer">
                <Button size="lg" className="bg-white px-8 font-semibold text-green-800 hover:bg-green-50">
                  Create Your Profile <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
