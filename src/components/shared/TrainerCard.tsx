"use client"

import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { StarRating } from "@/components/shared/StarRating"
import { formatCurrency, truncate } from "@/lib/utils"
import { MapPin, Users, Video, Heart, ShieldCheck, ArrowUpRight, Clock3, Sparkles } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface TrainerCardProps {
  trainer: {
    id: string
    slug: string
    firstName: string
    lastName: string
    headline?: string | null
    city?: string | null
    state?: string | null
    avgRating: number
    totalReviews: number
    totalSessions: number
    locationType: string
    sports: { sport: { name: string; icon?: string | null } }[]
    serviceOfferings: { priceInCents: number; durationMinutes: number }[]
    assets: { url: string; type: string; order: number }[]
    featured?: boolean
  }
}

export function TrainerCard({ trainer }: TrainerCardProps) {
  const initials = `${trainer.firstName[0]}${trainer.lastName[0]}`
  const minPrice = trainer.serviceOfferings.length > 0
    ? Math.min(...trainer.serviceOfferings.map(s => s.priceInCents))
    : null
  const maxDuration = trainer.serviceOfferings.length > 0
    ? Math.max(...trainer.serviceOfferings.map(s => s.durationMinutes))
    : null
  const photoUrl = trainer.assets.find(a => a.type === 'PHOTO' && a.order === 0)?.url
  const primarySport = trainer.sports[0]?.sport

  return (
    <Link href={`/trainers/${trainer.slug}`} className="block h-full">
      <Card className="group h-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.04] text-white transition duration-300 hover:-translate-y-1 hover:border-emerald-400/30 hover:shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
        <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-emerald-500/20 via-slate-900 to-slate-950">
          {photoUrl ? (
            <img src={photoUrl} alt={trainer.firstName} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
          ) : (
            <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.26),_transparent_34%),linear-gradient(160deg,_rgba(255,255,255,0.08),_rgba(255,255,255,0.03))]">
              <Avatar className="h-24 w-24 border border-white/15">
                <AvatarFallback className="text-3xl gradient-primary text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </div>
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/15 to-transparent" />

          <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {trainer.featured && (
                <Badge className="border-0 bg-white text-emerald-900">
                  <Sparkles className="mr-1 h-3.5 w-3.5" /> Featured
                </Badge>
              )}
              {primarySport && (
                <Badge className="border border-white/10 bg-slate-950/65 text-white hover:bg-slate-950/65">
                  {primarySport.icon} {primarySport.name}
                </Badge>
              )}
            </div>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation() }}
              className="rounded-full bg-white/90 p-2 text-slate-500 shadow-sm transition-colors hover:bg-white"
              aria-label="Save trainer"
            >
              <Heart className="h-4 w-4 transition-colors hover:text-rose-500" />
            </button>
          </div>

          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/72 p-3 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-300">Starting at</div>
                  <div className="text-lg font-semibold text-white">{minPrice !== null ? formatCurrency(minPrice) : 'Request quote'}</div>
                </div>
                {maxDuration !== null && (
                  <div className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">
                    <Clock3 className="h-3.5 w-3.5" /> Up to {maxDuration} min
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <CardContent className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-semibold tracking-tight">
                {trainer.firstName} {trainer.lastName[0]}.
              </h3>
              {trainer.headline && (
                <p className="mt-1 text-sm leading-6 text-slate-300">{truncate(trainer.headline, 78)}</p>
              )}
            </div>
            <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-slate-500 transition group-hover:text-emerald-300" />
          </div>

          <div className="mt-3">
            <StarRating rating={trainer.avgRating} size="sm" showValue reviewCount={trainer.totalReviews} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {trainer.sports.slice(0, 3).map((s, i) => (
              <Badge key={i} variant="secondary" className="bg-white/10 text-white hover:bg-white/10">
                {s.sport.icon} {s.sport.name}
              </Badge>
            ))}
          </div>

          <div className="mt-5 grid gap-3 rounded-[1.35rem] border border-white/10 bg-slate-950/45 p-4 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              {trainer.city && trainer.state ? (
                <>
                  <MapPin className="h-4 w-4 text-emerald-300" />
                  <span>{trainer.city}, {trainer.state}</span>
                </>
              ) : trainer.locationType === 'VIRTUAL' ? (
                <>
                  <Video className="h-4 w-4 text-emerald-300" />
                  <span>Virtual coaching available</span>
                </>
              ) : (
                <>
                  <Users className="h-4 w-4 text-emerald-300" />
                  <span>{trainer.totalSessions} completed sessions</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              <span>{trainer.totalReviews > 0 ? `${trainer.totalReviews} verified reviews visible` : 'Profile ready for first review'}</span>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-[0.16em] text-slate-300">
              Premium profile card • cleaner mobile scan
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}
