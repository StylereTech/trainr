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
      { q: 'How do I find a trainer?', a: 'Use the Browse page to search by sport, location, and rating. Read reviews from other parents, compare coaches, and book the one that fits.' },
      { q: 'How are trainers verified?', a: 'Every trainer has a profile with their background, credentials, and reviews from real parents. We verify coaches before they can accept bookings.' },
      { q: 'How does payment work?', a: 'You pay securely through Stripe when you book a session. The price is shown up front — no hidden fees or surprise charges.' },
      { q: 'Can I book recurring sessions?', a: 'Yes. Most families start with one session and rebook the coaches their kid connects with.' },
      { q: 'What sports do you cover?', a: 'Football, baseball, basketball, soccer, and track & field.' },
    ],
  },
  {
    category: 'For Trainers',
    items: [
      { q: 'How do I become a trainer on Trainr?', a: 'Sign up as a trainer, fill out your profile, add your services and availability, and start accepting bookings once approved.' },
      { q: 'How much does it cost?', a: 'It\'s free to create a profile and list your services. Trainr takes a 15% platform fee on each booking — you keep 85%.' },
      { q: 'Can I set my own prices?', a: 'Yes. You control your rates, session types, and availability. Change them anytime from your dashboard.' },
      { q: 'How do I get paid?', a: 'Connect your bank account through Stripe. After a completed session, your earnings go straight to your account.' },
    ],
  },
  {
    category: 'Safety & Trust',
    items: [
      { q: 'What safety measures are built in?', a: 'Verified trainer profiles, secure Stripe payments, in-app messaging, and session-based reviews. You always know who you\'re booking.' },
      { q: 'How do I report a concern?', a: 'Go to the Contact page and select "Safety Concern" as the topic. Our team will follow up within 24 hours.' },
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
            <h1 className="text-4xl font-bold tracking-tight md:text-6xl">Common questions, straight answers.</h1>
            <p className="mt-5 text-lg text-slate-300">Everything you need to know about finding coaches, booking sessions, and getting paid.</p>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/10 shadow-2xl">
            <Image src={TRAINR_IMAGE_CATALOG.basketball.hero.src} alt={TRAINR_IMAGE_CATALOG.basketball.hero.alt} width={1200} height={1200} className="h-[320px] w-full object-cover md:h-[420px]" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6">
              <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 backdrop-blur">
                <div className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-300" /> No surprises</div>
                <p className="mt-2 text-sm text-slate-300">Clear pricing, verified coaches, and secure payments. You know what you&apos;re getting before you book.</p>
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
            <p className="mt-2 text-sm text-muted-foreground">Reach out and we&apos;ll get back to you within 24 hours.</p>
            <Link href="/contact">
              <Button className="mt-5 gradient-primary border-0 text-white">Contact Us <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
