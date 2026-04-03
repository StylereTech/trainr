import Link from 'next/link'
import { requireAuth } from '@/lib/route-guards'
import { Button } from '@/components/ui/button'
import {
  LayoutDashboard, Users, UserCheck, Calendar, DollarSign,
  AlertTriangle, Settings, Tag, BarChart3, Shield, ArrowLeft,
} from 'lucide-react'

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/trainers', label: 'Trainer Approvals', icon: UserCheck },
  { href: '/admin/bookings', label: 'Bookings', icon: Calendar },
  { href: '/admin/payouts', label: 'Payouts & Revenue', icon: DollarSign },
  { href: '/admin/disputes', label: 'Disputes', icon: AlertTriangle },
  { href: '/admin/settings', label: 'Fee Settings', icon: Settings },
  { href: '/admin/coupons', label: 'Coupons', icon: Tag },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
]

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAuth(['ADMIN'])

  return (
    <div className="-mx-4 -my-0 flex min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_top,_rgba(34,197,94,0.14),_transparent_28%),linear-gradient(180deg,_#020617_0%,_#08111f_100%)] text-white lg:-mx-6">
      <aside className="hidden w-72 shrink-0 border-r border-white/10 bg-slate-950/90 lg:flex lg:flex-col">
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-500/15 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/20">TR</div>
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-slate-400">Trainr ops</div>
              <div className="mt-1 text-lg font-semibold text-white">Admin command</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white">
              <item.icon className="h-4 w-4 text-emerald-300" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <Link href="/">
            <Button variant="ghost" className="w-full justify-start gap-2 rounded-2xl text-slate-300 hover:bg-white/10 hover:text-white">
              <ArrowLeft className="h-4 w-4" />
              Back to site
            </Button>
          </Link>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/80 px-4 py-4 backdrop-blur lg:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
              <Shield className="h-4 w-4 text-emerald-300" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Private ops surface</div>
              <span className="text-sm font-medium text-slate-200">Admin panel</span>
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 lg:p-6">{children}</main>
      </div>
    </div>
  )
}
