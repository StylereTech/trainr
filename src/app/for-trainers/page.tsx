import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Star, Calendar, DollarSign, Users, Zap, ShieldCheck, Sparkles, CheckCircle2, Clock3, LayoutDashboard, HandCoins, MapPin, QrCode } from 'lucide-react'
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
  { icon: HandCoins, title: 'Launch economics', text: 'Founding Dallas trainers get commission waived for the first 30 days.' },
]

const growthSignals = [
  'Private sessions, groups, and packages supported',
  'Review-backed reputation growth over time',
  'Flexible local and virtual coaching options',
  'No subscription required to apply',
]

const trainerPricingPackages = [
  {
    name: 'Founding Dallas Trainer',
    price: '$49–$99',
    after: 'Early listing fee • 0% commission for your first 30 days',
    description: 'Best for independent Dallas coaches who want to get listed early, collect leads, and prove demand before monthly costs.',
    features: ['Founding Dallas Trainer badge', 'Public profile + booking page', 'Unlimited services and packages', '10–15% commission only after day 30'],
  },
  {
    name: 'Founding Trainer Package',
    price: '$199–$499',
    after: 'Done-with-you launch setup for serious coaches',
    description: 'For trainers who want Trainr to help polish the offer and make the page look credible before outreach starts.',
    features: ['Profile setup', 'Photos and bio cleanup', 'Booking page and package strategy', 'Early promotion + lead priority'],
  },
  {
    name: 'Team / Academy',
    price: 'Custom',
    after: 'Built for gyms, clubs, camps, and multi-coach programs',
    description: 'For organizations that need multiple coaches, recurring sessions, camps, and higher-volume parent demand.',
    features: ['Multi-coach setup', 'Camp and group package planning', 'Custom onboarding', 'Priority Dallas launch placement'],
  },
]

const revenueModel = [
  { title: 'Per-booking commission', value: '10–15%', text: 'Simple and aligned: Trainr earns when a parent books through the platform.' },
  { title: 'Parent match fee', value: '$10–$25', text: 'Parents can pay to get matched with 2–3 trainers, with the fee credited toward their first booking.' },
  { title: 'First 30 days', value: '0%', text: 'Founding Dallas trainers keep every platform dollar for the first month after joining.' },
]

const fieldOutreachPoints = [
  'Gyms, courts, fields, youth games, camps, and private training spots',
  'QR flyer: “Dallas trainers: get booked by local parents.”',
  'Pitch: founding profile, first 30 days commission-free, early Dallas lead priority',
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
                Set your rates, control your schedule, and let Dallas families find you. Founding trainers can launch with an early listing, a polished profile, and 0% Trainr commission for the first 30 days.
              </p>
              <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                <Link href="/auth/signup?role=trainer">
                  <Button size="lg" className="w-full bg-white px-8 font-semibold text-green-800 hover:bg-green-50 sm:w-auto">
                    Become a Founding Dallas Trainer <ArrowRight className="ml-2 h-4 w-4" />
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
        <div className="container">
          <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="max-w-2xl">
              <Badge className="mb-4 border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">Launch offer</Badge>
              <h2 className="text-3xl font-bold md:text-4xl">Founding Dallas trainers get 30 days commission-free.</h2>
              <p className="mt-3 text-slate-300">Start with a simple early listing fee, get a credible profile live, and keep 100% of Trainr platform commission during your first month.</p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {trainerPricingPackages.map((pkg) => (
              <Card key={pkg.name} className="h-full border-white/10 bg-white/[0.04] text-white shadow-lg">
                <CardContent className="flex h-full flex-col p-6 md:p-7">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-emerald-300">{pkg.name}</div>
                  <div className="mt-4 text-3xl font-bold">{pkg.price}</div>
                  <p className="mt-2 text-sm text-slate-400">{pkg.after}</p>
                  <p className="mt-5 text-sm leading-6 text-slate-300">{pkg.description}</p>
                  <div className="mt-6 grid gap-3">
                    {pkg.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3 text-sm text-slate-200">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/auth/signup?role=trainer" className="mt-7">
                    <Button className="w-full gradient-primary border-0 text-white">Apply as a founding trainer <ArrowRight className="ml-2 h-4 w-4" /></Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-flow py-16 md:py-20">
        <div className="container grid gap-6 lg:grid-cols-[.95fr_1.05fr]">
          <Card className="border-white/10 bg-white/[0.04] text-white shadow-lg">
            <CardContent className="p-6 md:p-8">
              <Badge className="mb-4 border-white/15 bg-white/5 text-white hover:bg-white/5"><DollarSign className="mr-1 h-3.5 w-3.5" /> Revenue model</Badge>
              <h2 className="text-3xl font-bold">Clear pricing that works for both sides.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">Trainr keeps the offer simple: trainers can pay to get listed and promoted early, then the platform earns from successful bookings and high-intent parent matches.</p>
              <div className="mt-6 grid gap-4">
                {revenueModel.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-slate-950/50 p-5">
                    <div className="flex items-center justify-between gap-4">
                      <h3 className="text-sm font-semibold text-white">{item.title}</h3>
                      <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm font-bold text-emerald-200">{item.value}</span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-300">{item.text}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white shadow-lg">
            <CardContent className="p-6 md:p-8">
              <Badge className="mb-4 border-white/15 bg-white/5 text-white hover:bg-white/5"><MapPin className="mr-1 h-3.5 w-3.5" /> Field acquisition</Badge>
              <h2 className="text-3xl font-bold">Door-to-door trainer outreach in Dallas.</h2>
              <p className="mt-3 text-sm leading-6 text-slate-300">The unfair advantage is local presence: show up where trainers already work, scan the QR, and get them listed before competitors can copy the marketplace.</p>
              <div className="mt-6 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-5">
                <div className="flex items-center gap-3 text-lg font-bold text-emerald-100"><QrCode className="h-6 w-6" /> Dallas trainers: get booked by local parents.</div>
                <p className="mt-2 text-sm text-emerald-50/80">Scan to claim a Founding Dallas Trainer profile and 30 days commission-free.</p>
              </div>
              <div className="mt-6 grid gap-3">
                {fieldOutreachPoints.map((point) => (
                  <div key={point} className="flex items-start gap-3 text-sm text-slate-200">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                    <span>{point}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
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
                  <span className="text-sm text-rose-300">Platform Fee (10–15%)</span>
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
              <p className="mt-4 text-sm text-slate-400">Based on a $75 individual session at the standard 15% platform fee. Founding Dallas trainers get Trainr commission waived for the first 30 days.</p>
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
                  <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Clock3 className="h-4 w-4" /> Founding launch terms</div>
                  <p className="mt-2 text-sm text-slate-300">Early trainers can secure a Founding Dallas Trainer profile, launch with 0% Trainr commission for 30 days, then move to the standard 10–15% booking commission.</p>
                </div>
              </CardContent>
            </Card>

            <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900/60">
              <div className="relative p-6">
                <p className="text-sm font-semibold text-white">Dallas launch focus</p>
                <p className="mt-2 text-sm text-slate-300">We are recruiting trainers field-by-field, gym-by-gym, and court-by-court so local parents can find real coaches nearby.</p>
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
              <p className="mx-auto mb-8 max-w-2xl text-slate-200">Create your Founding Dallas Trainer profile, publish offers, and start attracting families who are already looking for trusted youth coaching.</p>
              <Link href="/auth/signup?role=trainer">
                <Button size="lg" className="bg-white px-8 font-semibold text-green-800 hover:bg-green-50">
                  Apply as a Founding Trainer <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
