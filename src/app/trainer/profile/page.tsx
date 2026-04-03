import Link from 'next/link'
import Image from 'next/image'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'
import { ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Settings, ShieldCheck, Sparkles, Wallet } from 'lucide-react'

const profileSections = [
  {
    title: 'Public profile quality',
    description: 'Dial in your headline, bio, sports, specialties, and trust cues before families ever land on your page.',
    icon: Sparkles,
  },
  {
    title: 'Services & pricing',
    description: 'Keep session titles, durations, group limits, and rates tight so booking flows feel credible and easy to compare.',
    icon: ClipboardCheck,
  },
  {
    title: 'Availability & payout readiness',
    description: 'Match your schedule to real capacity and keep your dashboard, earnings, and acceptance flow aligned.',
    icon: Wallet,
  },
]

const checklist = [
  'Headline and bio clearly explain who you coach and how you coach.',
  'Sports and specialties align with what families can actually book.',
  'Services have realistic prices, durations, and session formats.',
  'Availability reflects your real weekly operating window.',
  'Dashboard is ready for confirmation, completion, and payout follow-through.',
]

export default function TrainerProfilePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.18),_transparent_34%),linear-gradient(180deg,_#03110a_0%,_#08131f_100%)]">
        <div className="container py-10 md:py-14">
          <div className="grid gap-8 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
            <div className="max-w-3xl">
              <Badge className="border border-emerald-400/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/10">
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Trainer profile workspace
              </Badge>
              <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] md:text-5xl">Keep your trainer brand, booking setup, and operations in one polished workflow.</h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                This surface now works like a real profile command center instead of a redirect dead-end. Use it to tighten what families see,
                keep your services bookable, and jump directly into the premium onboarding editor or trainer dashboard.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link href="/trainer/onboarding">
                  <Button className="gradient-primary w-full border-0 text-white sm:w-auto">
                    <Settings className="mr-2 h-4 w-4" /> Edit trainer profile
                  </Button>
                </Link>
                <Link href="/trainer/dashboard">
                  <Button variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white sm:w-auto">
                    <CalendarDays className="mr-2 h-4 w-4" /> Open trainer dashboard
                  </Button>
                </Link>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  { label: 'Profile control', value: 'Unified', note: 'bio, services, schedule' },
                  { label: 'Family trust', value: 'Higher', note: 'clearer positioning + pricing' },
                  { label: 'Operations handoff', value: 'Faster', note: 'dashboard-ready workflow' },
                ].map((item) => (
                  <div key={item.label} className="rounded-[1.5rem] border border-white/10 bg-white/[0.05] p-4">
                    <div className="text-[11px] uppercase tracking-[0.2em] text-slate-300">{item.label}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{item.value}</div>
                    <div className="mt-1 text-xs text-slate-400">{item.note}</div>
                  </div>
                ))}
              </div>
            </div>

            <Card className="overflow-hidden rounded-[2rem] border-white/10 bg-white/[0.05] text-white shadow-2xl">
              <CardContent className="p-0">
                <div className="relative">
                  <Image
                    src={TRAINR_IMAGE_CATALOG.basketball.brand.src}
                    alt={TRAINR_IMAGE_CATALOG.basketball.brand.alt}
                    width={1200}
                    height={1200}
                    className="h-[320px] w-full object-cover"
                    priority
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/30 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5">
                    <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-4 backdrop-blur">
                      <div className="flex items-center gap-2 text-sm font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Profile quality matters</div>
                      <p className="mt-2 text-sm leading-6 text-slate-300">Families decide faster when your specialties, session types, and availability read like a finished premium profile.</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="container py-8 md:py-10">
        <div className="grid gap-4 lg:grid-cols-3">
          {profileSections.map((section) => (
            <Card key={section.title} className="border-white/10 bg-white/[0.04] text-white">
              <CardContent className="p-5 md:p-6">
                <section.icon className="h-5 w-5 text-emerald-300" />
                <h2 className="mt-4 text-lg font-semibold">{section.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{section.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardContent className="p-5 md:p-6">
              <div className="text-sm font-semibold text-emerald-300">Production-ready trainer checklist</div>
              <div className="mt-4 space-y-3">
                {checklist.map((item) => (
                  <div key={item} className="flex gap-3 rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-300" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-white/10 bg-white/[0.04] text-white">
            <CardContent className="flex h-full flex-col justify-between p-5 md:p-6">
              <div>
                <div className="text-sm font-semibold text-emerald-300">Next best actions</div>
                <div className="mt-4 space-y-3 text-sm text-slate-300">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    Finish profile edits in onboarding so your public page, services, and schedule stay aligned.
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
                    Move to the dashboard to confirm requests, complete sessions, and manage earnings once your setup is dialed in.
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <Link href="/trainer/onboarding" className="inline-flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white hover:bg-white/[0.08]">
                  <span>Edit onboarding details</span>
                  <ArrowRight className="h-4 w-4 text-emerald-300" />
                </Link>
                <Link href="/trainer/dashboard" className="inline-flex items-center justify-between rounded-[1.25rem] border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white hover:bg-white/[0.08]">
                  <span>Open trainer dashboard</span>
                  <ArrowRight className="h-4 w-4 text-emerald-300" />
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
