import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import type { Metadata } from 'next'
import { TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about Trainr — finding trainers, booking sessions, payments, and more.',
}

const faqs = [
  {
    category: 'For Parents',
    items: [
      { q: 'How do I find a trainer?', a: 'Browse the marketplace, filter by sport and location, compare reviews and specialties, and shortlist coaches whose profile quality actually gives you confidence.' },
      { q: 'How are trainers verified?', a: 'Trainer profiles are structured around trust signals so families can review background, experience, and profile quality before booking.' },
      { q: 'How does payment work?', a: 'Payments are handled securely through Stripe. Booking requests stay clear about when payment happens so parents do not feel surprised at checkout.' },
      { q: 'Can I book recurring sessions?', a: 'Yes. Many families start with a first session, then rebook the right trainer for consistency over time.' },
      { q: 'What sports do you cover?', a: 'Trainr currently supports football, baseball, basketball, soccer, and track & field, with approved live visual coverage now across all five core sports.' },
    ],
  },
  {
    category: 'For Trainers',
    items: [
      { q: 'How do I become a trainer on Trainr?', a: 'Sign up as a trainer, complete your profile, publish your offerings, and move through the approval process before accepting bookings.' },
      { q: 'How much does it cost?', a: 'Creating a profile is designed to stay low-friction. Platform economics are shown clearly so coaches understand what they keep from each booking.' },
      { q: 'Can I set my own prices?', a: 'Yes. Trainers control their service types, rates, and availability while building verified social proof over time.' },
      { q: 'How do I get paid?', a: 'Payouts are handled through Stripe-connected payment flows so the money side feels cleaner and more credible.' },
    ],
  },
  {
    category: 'Safety & Trust',
    items: [
      { q: 'What safety measures are built in?', a: 'Trainr emphasizes verified profiles, clearer trust signals, secure payments, and platform-based communication over scattered texts and guesswork.' },
      { q: 'How do I report a concern?', a: 'Use the contact flow and choose the safety topic so it can be routed appropriately.' },
    ],
  },
]

export default function FAQPage() {
  return (
    <div className="bg-white">
      <section className="relative overflow-hidden bg-slate-950 py-16 text-white md:py-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.25),_transparent_38%),linear-gradient(180deg,_#04130b_0%,_#08131f_100%)]" />
        <div className="container relative grid items-center gap-10 lg:grid-cols-[1fr_.9fr]">
          <div className="max-w-2xl">
            <div className="mb-4 inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-4 py-2 text-sm text-emerald-100">Trainr FAQ</div>
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Answers built for faster confidence.</h1>
            <p className="mt-5 text-lg text-slate-300">Everything families and trainers need to know about discovery, booking, trust, and platform flow.</p>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 shadow-2xl">
            <Image src={TRAINR_IMAGE_CATALOG.basketball.hero.src} alt={TRAINR_IMAGE_CATALOG.basketball.hero.alt} width={1200} height={1200} className="h-[320px] w-full object-cover md:h-[420px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Clearer expectations from day one</div>
                <p className="mt-2 text-sm text-slate-300">The goal is less uncertainty, fewer support loops, and a booking flow that feels self-explanatory.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-20">
        <div className="container max-w-4xl space-y-8">
          {faqs.map((category) => (
            <div key={category.category} className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <h2 className="mb-4 text-2xl font-bold">{category.category}</h2>
              <Accordion type="single" collapsible className="w-full">
                {category.items.map((item, i) => (
                  <AccordionItem key={i} value={`${category.category}-${i}`}>
                    <AccordionTrigger className="text-left text-base">{item.q}</AccordionTrigger>
                    <AccordionContent className="text-sm leading-7 text-muted-foreground">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          ))}

          <div className="rounded-[1.75rem] bg-slate-50 p-8 text-center">
            <h3 className="text-lg font-bold">Still have questions?</h3>
            <p className="mt-2 text-sm text-muted-foreground">Our team can route your question to support, safety, billing, or trainer onboarding.</p>
            <Link href="/contact">
              <Button className="mt-5 gradient-primary border-0 text-white">Contact Us <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
