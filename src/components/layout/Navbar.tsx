"use client"

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Menu, X, LogOut, LayoutDashboard, MessageSquare, Shield, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TRAINR_LOGO } from '@/lib/trainr-media'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/browse', label: 'Find Trainers' },
  { href: '/sports', label: 'Sports' },
  { href: '/how-it-works', label: 'How It Works' },
  { href: '/for-trainers', label: 'For Trainers' },
]

export function Navbar() {
  const pathname = usePathname()
  const { data: session } = useSession()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const role = (session?.user as any)?.role
  const isLoggedIn = !!session?.user
  const dashboardHref = role === 'TRAINER' ? '/trainer/dashboard' : role === 'ADMIN' ? '/admin' : '/parent/dashboard'
  const isHeroSurface = pathname === '/' || pathname.startsWith('/auth') || pathname === '/browse' || pathname === '/sports' || pathname === '/how-it-works' || pathname === '/for-trainers'

  return (
    <header className={cn(
      'sticky top-0 z-50 w-full text-white backdrop-blur-xl',
      isHeroSurface ? 'border-b border-white/10 bg-slate-950/45 supports-[backdrop-filter]:bg-slate-950/38' : 'border-b border-white/10 bg-slate-950/88 supports-[backdrop-filter]:bg-slate-950/78'
    )}>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="container flex h-[72px] items-center justify-between gap-4 py-3">
        <Link href="/" className="flex items-center gap-3">
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-sm">
            <Image
              src={TRAINR_LOGO.src}
              alt={TRAINR_LOGO.alt}
              width={44}
              height={44}
              className="h-11 w-11 object-cover"
              priority
            />
          </div>

        </Link>

        <nav className="hidden items-center gap-2 md:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'rounded-full px-4 py-2 text-sm font-medium transition-colors',
                pathname === link.href
                  ? 'bg-white/10 text-white'
                  : 'text-slate-300 hover:bg-white/5 hover:text-white'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {isLoggedIn ? (
            <>
              {role === 'ADMIN' && (
                <Link href="/admin">
                  <Button variant="ghost" size="sm" className="text-slate-200 hover:bg-white/10 hover:text-white">
                    <Shield className="mr-1.5 h-4 w-4" />
                    Admin
                  </Button>
                </Link>
              )}
              <Link href={dashboardHref}>
                <Button variant="ghost" size="sm" className="text-slate-200 hover:bg-white/10 hover:text-white">
                  <LayoutDashboard className="mr-1.5 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
              <Link href="/messages">
                <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-200 hover:bg-white/10 hover:text-white">
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </Link>
              <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: '/' })} className="text-slate-300 hover:bg-white/10 hover:text-white">
                <LogOut className="mr-1.5 h-4 w-4" />
                Sign Out
              </Button>
            </>
          ) : (
            <>
              <Link href="/auth/signin">
                <Button variant="ghost" size="sm" className="text-slate-200 hover:bg-white/10 hover:text-white">Sign In</Button>
              </Link>
              <Link href="/auth/signup">
                <Button size="sm" className="gradient-primary border-0 text-white shadow-sm">Get Started</Button>
              </Link>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10 hover:text-white md:hidden"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {mobileMenuOpen && (
        <div className="border-t border-white/10 bg-slate-950/90 md:hidden">
          <div className="container space-y-3 py-4">
            <div className="grid gap-2">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition-colors',
                    pathname === link.href
                      ? 'border-emerald-400/30 bg-emerald-400/10 text-white'
                      : 'border-white/10 bg-white/[0.04] text-slate-200'
                  )}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                  <ChevronRight className="h-4 w-4" />
                </Link>
              ))}
            </div>
            <div className="space-y-2 border-t border-white/10 pt-3">
              {isLoggedIn ? (
                <>
                  {role === 'ADMIN' && (
                    <Link href="/admin" className="block" onClick={() => setMobileMenuOpen(false)}>
                      <Button variant="outline" className="w-full justify-start border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                        <Shield className="mr-2 h-4 w-4" />Admin Panel
                      </Button>
                    </Link>
                  )}
                  <Link href={dashboardHref} className="block" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full justify-start border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                      <LayoutDashboard className="mr-2 h-4 w-4" />Dashboard
                    </Button>
                  </Link>
                  <Link href="/messages" className="block" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full justify-start border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                      <MessageSquare className="mr-2 h-4 w-4" />Messages
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-rose-300 hover:bg-rose-500/10 hover:text-rose-200"
                    onClick={() => { setMobileMenuOpen(false); signOut({ callbackUrl: '/' }) }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />Sign Out
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/auth/signin" className="block" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">Sign In</Button>
                  </Link>
                  <Link href="/auth/signup" className="block" onClick={() => setMobileMenuOpen(false)}>
                    <Button className="w-full gradient-primary border-0 text-white">Get Started</Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
