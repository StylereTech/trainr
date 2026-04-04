import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Target, Heart, Trophy, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react'
import type { Metadata } from 'next'
import { TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Trainr\'s mission to connect every young athlete with expert coaching.',
}

export default function AboutPage() {
  return (
    <div className="bg-white">
      <section className="relative overflow-hidden bg-slate-950 py-16 text-white md:py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.25),_transparent_38%),linear-gradient(180deg,_#04130b_0%,_#08131f_100%)]" />
        <div className="container relative grid items-center gap-10 lg:grid-cols-[1fr_.95fr]">
          <div className="max-w-2xl text-center lg:text-left">
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">About Trainr</div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Building better athletes, one trusted session at a time.</h1>
            <p className="mt-6 text-lg text-slate-300">Trainr exists to make expert youth sports coaching more accessible, more credible, and easier for families to book with confidence.</p>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 shadow-2xl">
            <Image src={TRAINR_IMAGE_CATALOG.soccer.brand.src} alt={TRAINR_IMAGE_CATALOG.soccer.brand.alt} width={1200} height={1200} className="h-[420px] w-full object-cover md:h-[520px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 backdrop-blur">
                <p className="text-sm font-semibold text-white">The marketplace for youth sports coaching.</p>
                <p className="mt-2 text-sm text-slate-300">Find trusted coaches, book sessions, and give your athlete the training they deserve.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-12 md:py-16">
        <div className="container max-w-5xl">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Target, title: 'Our Mission', description: 'Make expert youth sports coaching accessible, safe, and transparent for families everywhere.' },
              { icon: Heart, title: 'Our Values', description: 'Safety first. Transparency always. Every trainer verified, every review earned, every payment secure.' },
              { icon: Trophy, title: 'Our Vision', description: 'Finding a great coach should feel as easy, trusted, and organized as any modern marketplace.' },
            ].map((item) => (
              <Card key={item.title} className="h-full border-slate-200 shadow-sm">
                <CardContent className="p-6 text-center">
                  <div className="mx-auto mb-4 inline-flex rounded-2xl bg-emerald-50 p-3">
                    <item.icon className="h-6 w-6 text-emerald-700" />
                  </div>
                  <h3 className="text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16">
        <div className="container grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700"><Users className="h-4 w-4" /> The story behind Trainr</div>
            <div className="space-y-4 text-muted-foreground">
              <p>Families know the problem: kids fall in love with sports, but finding trustworthy coaching outside school or rec leagues is messy.</p>
              <p>Word-of-mouth only goes so far. Search results are noisy. Many coaches have no real reviews, no clear credibility, and no parent-friendly booking flow.</p>
              <p>Trainr was built to change that. Parents can find, vet, and book youth sports trainers with more confidence. Trainers can grow a serious coaching business with stronger brand presence and verified social proof.</p>
              <p>The goal is simple: make better coaching easier to find and easier to trust.</p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {['Verified coaches with real reviews', 'Covers 5 major youth sports', 'Secure booking and payments', 'Built for parents and athletes'].map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700 shadow-sm">
                  <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-600" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <Card className="overflow-hidden border-slate-200 shadow-xl">
            <Image src={TRAINR_IMAGE_CATALOG['track-field'].brand.src} alt={TRAINR_IMAGE_CATALOG['track-field'].brand.alt} width={1200} height={1200} className="h-[420px] w-full object-cover" />
            <CardContent className="p-6">
              <div className="flex items-center gap-2 font-semibold text-slate-900"><ShieldCheck className="h-4 w-4 text-emerald-700" /> Built around trust signals</div>
              <p className="mt-2 text-sm text-muted-foreground">Profiles, reviews, pricing clarity, and booking steps are all designed to remove guesswork for parents and make quality coaches stand out.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="gradient-hero py-16 text-white">
        <div className="container text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em]"><Sparkles className="h-4 w-4" /> Get started today</div>
          <h2 className="mb-4 text-3xl font-bold">Join the Trainr community</h2>
          <p className="mb-8 text-green-100">Whether you&apos;re a parent looking for coaching or a trainer ready to grow, we&apos;re here for you.</p>
          <div className="flex flex-col justify-center gap-4 sm:flex-row">
            <Link href="/browse">
              <Button size="lg" className="bg-white px-8 font-semibold text-green-800 hover:bg-green-50">
                Find a Trainer <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <Link href="/auth/signup?role=trainer">
              <Button size="lg" variant="outline" className="border-white/30 px-8 text-white hover:bg-white/10">
                Become a Trainer
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
