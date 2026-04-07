import Image from 'next/image'
import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { SPORTS } from '@/lib/utils'
import { TRAINR_LOGO } from '@/lib/trainr-media'

export function Footer() {
  return (
    <footer className="border-t border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.14),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#071220_50%,_#08131f_100%)] text-white">
      <div className="container py-12 md:py-16">
        <div className="mb-10 grid gap-4 rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 md:grid-cols-[1.15fr_.85fr] md:p-6">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-300">Trainr premium platform</div>
            <h3 className="mt-2 text-2xl font-semibold">Built to make youth coaching discovery feel safer, cleaner, and more credible.</h3>
          </div>
          <div className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2">
            {['Approved live assets now cover all five core sports', 'Fallback placeholders still protect any future categories without approved imagery', 'Parent-first trust cues stay visible across discovery and booking', 'Mobile layouts now stack more cleanly on every key surface'].map((item) => (
              <div key={item} className="flex gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="mb-4 flex items-center gap-3">
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-sm">
                <Image src={TRAINR_LOGO.src} alt={TRAINR_LOGO.alt} width={44} height={44} className="h-11 w-11 object-cover" />
              </div>
              <div>
                <span className="block text-xl font-bold">&nbsp;</span>
                <span className="text-xs uppercase tracking-[0.2em] text-emerald-200">Youth sports coaching</span>
              </div>
            </Link>
            <p className="max-w-xs text-sm text-slate-300">
              Connecting families with trusted youth sports trainers through a premium, safety-first booking experience.
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Sports</h4>
            <ul className="space-y-2">
              {SPORTS.map((sport) => (
                <li key={sport.slug}>
                  <Link href={`/browse?sport=${sport.slug}`} className="text-sm text-slate-300 transition-colors hover:text-white">
                    {sport.icon} {sport.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Company</h4>
            <ul className="space-y-2">
              <li><Link href="/about" className="text-sm text-slate-300 hover:text-white">About</Link></li>
              <li><Link href="/how-it-works" className="text-sm text-slate-300 hover:text-white">How It Works</Link></li>
              <li><Link href="/for-trainers" className="text-sm text-slate-300 hover:text-white">For Trainers</Link></li>
              <li><Link href="/contact" className="text-sm text-slate-300 hover:text-white">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-white">Legal</h4>
            <ul className="space-y-2">
              <li><Link href="/legal/terms" className="text-sm text-slate-300 hover:text-white">Terms of Service</Link></li>
              <li><Link href="/legal/privacy" className="text-sm text-slate-300 hover:text-white">Privacy Policy</Link></li>
              <li><Link href="/legal/safety" className="text-sm text-slate-300 hover:text-white">Safety Guidelines</Link></li>
              <li><Link href="/legal/refunds" className="text-sm text-slate-300 hover:text-white">Refund Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-8 md:flex-row">
          <p className="text-sm text-slate-400">© {new Date().getFullYear()} Trainr. All rights reserved.</p>
          <Link href="/browse" className="inline-flex items-center text-sm font-medium text-emerald-300 hover:text-emerald-200">
            Browse trainers <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>
      </div>
    </footer>
  )
}
