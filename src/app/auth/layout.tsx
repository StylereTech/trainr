import Image from 'next/image'
import { TRAINR_IMAGE_CATALOG } from '@/lib/trainr-media'
import { redirectIfAuthenticated } from '@/lib/route-guards'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  await redirectIfAuthenticated()

  return (
    <div className="relative min-h-[calc(100vh-72px)] overflow-hidden bg-slate-950 text-white">
      <Image
        src={TRAINR_IMAGE_CATALOG.soccer.hero.src}
        alt={TRAINR_IMAGE_CATALOG.soccer.hero.alt}
        fill
        priority
        className="object-cover object-center"
      />
      <div className="hero-overlay" />
      <div className="hero-mesh" />
      <div className="relative">{children}</div>
    </div>
  )
}
