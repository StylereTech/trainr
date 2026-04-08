import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Users, Target, Heart, Trophy, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About',
  description: 'Learn about Trainr\'s mission to connect every young athlete with expert coaching.',
}

export default function AboutPage() {
  return (
    <div className="bg-slate-950 text-white">
      <section className="site-hero border-b border-white/10">
        <Image src="/images/trainr/custom/multi-sport-group.jpg" alt="Multi-sport youth athletes training together" fill priority className="object-cover object-top" />
        <div className="hero-overlay" />
        <div className="hero-mesh" />
        <div className="container relative py-16 md:py-24 lg:py-28">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_.95fr]">
            <div className="max-w-2xl text-center lg:text-left">
              <div className="mb-4 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">About Trainr</div>
              <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Building better athletes, one trusted session at a time.</h1>
              <p className="mt-6 text-lg text-slate-300">Trainr exists to make expert youth sports coaching more accessible, more credible, and easier for families to book with confidence.</p>
            </div>
            <div className="premium-shell p-0">
              <div className="overflow-hidden rounded-[2rem] bg-slate-900/60 p-8 md:p-12">
                <div className="premium-panel p-5">
                  <p className="text-sm font-semibold text-white">The marketplace for youth sports coaching.</p>
                  <p className="mt-2 text-sm text-slate-300">Find trusted coaches, book sessions, and give your athlete the training they deserve.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow py-12 md:py-16">
        <div className="container max-w-5xl">
          <div className="grid gap-6 md:grid-cols-3">
            {[
              { icon: Target, title: 'Our Mission', description: 'Make expert youth sports coaching accessible, safe, and transparent for families everywhere.' },
              { icon: Heart, title: 'Our Values', description: 'Safety first. Transparency always. Every trainer verified, every review earned, every payment secure.' },
              { icon: Trophy, title: 'Our Vision', description: 'Finding a great coach should feel as easy, trusted, and organized as any modern marketplace.' },
            ].map((item) => (
              <Card key={item.title} className="h-full border-white/10 bg-white/[0.04] text-white shadow-sm">
                <CardContent className="p-6 text-center">
                  <div className="mx-auto mb-4 inline-flex rounded-2xl bg-emerald-400/10 p-3">
                    <item.icon className="h-6 w-6 text-emerald-300" />
                  </div>
                  <h3 className="text-lg font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{item.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="section-flow py-16">
        <div className="container grid items-center gap-10 lg:grid-cols-[1.05fr_.95fr]">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm font-medium text-slate-200"><Users className="h-4 w-4 text-emerald-300" /> The story behind Trainr</div>
            <div className="space-y-4 text-slate-300 leading-7">
              <p>Families know the problem: kids fall in love with sports, but finding trustworthy coaching outside school or rec leagues is messy.</p>
              <p>Word-of-mouth only goes so far. Search results are noisy. Many coaches have no real reviews, no clear credibility, and no parent-friendly booking flow.</p>
              <p>Trainr was built to change that. Parents can find, vet, and book youth sports trainers with more confidence. Trainers can grow a serious coaching business with stronger brand presence and verified social proof.</p>
              <p>The goal is simple: make better coaching easier to find and easier to trust.</p>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {['Verified coaches with real reviews', 'Covers 5 major youth sports', 'Secure booking and payments', 'Built for parents and athletes'].map((item) => (
                <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-slate-200 shadow-sm">
                  <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-300" />
                  {item}
                </div>
              ))}
            </div>
          </div>
          <div className="premium-shell p-0">
            <div className="relative overflow-hidden rounded-[2rem]">
              <Image src="/images/trainr/custom/basketball-group.jpg" alt="Youth basketball team group training session" width={1200} height={900} className="h-[420px] w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <div className="premium-panel p-5">
                  <div className="flex items-center gap-2 font-semibold text-white"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Built around trust signals</div>
                  <p className="mt-2 text-sm text-slate-300">Profiles, reviews, pricing clarity, and booking steps are all designed to remove guesswork for parents and make quality coaches stand out.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-flow py-16">
        <div className="container">
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10">
            <Image src="/images/trainr/custom/football-stretching.jpg" alt="Coach leading youth athletes through stretching and warm-up drills" fill className="object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-slate-950/30" />
            <div className="relative p-8 text-center md:p-12">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs uppercase tracking-[0.2em] backdrop-blur"><Sparkles className="h-4 w-4" /> Get started today</div>
              <h2 className="mb-4 text-3xl font-bold">Join the Trainr community</h2>
              <p className="mx-auto mb-8 max-w-lg text-slate-200">Whether you&apos;re a parent looking for coaching or a trainer ready to grow, we&apos;re here for you.</p>
              <div className="flex flex-col justify-center gap-4 sm:flex-row">
                <Link href="/browse">
                  <Button size="lg" className="w-full bg-white px-8 font-semibold text-green-800 hover:bg-green-50 sm:w-auto">
                    Find a Trainer <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>
                <Link href="/auth/signup?role=trainer">
                  <Button size="lg" variant="outline" className="w-full border-white/30 px-8 text-white hover:bg-white/10 sm:w-auto">
                    Become a Trainer
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
