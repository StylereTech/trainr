export const TRAINR_LOGO = {
  src: '/brand/trainr-logo-main.jpg',
  alt: 'Trainr multi-sport shield logo',
}

type LiveImage = {
  kind: 'image'
  src: string
  alt: string
  tone: string
  usage: string[]
}

type PlaceholderImage = {
  kind: 'placeholder'
  label: string
  alt: string
  status: string
  tone: string
  usage: string[]
}

export const TRAINR_IMAGE_CATALOG = {
  baseball: {
    hero: {
      kind: 'image',
      src: '/images/trainr/baseball-hero.jpg',
      alt: 'Youth baseball athlete working with a coach during private training',
      tone: 'clean, editorial, trust-building',
      usage: ['homepage hero', 'browse spotlight', 'auth support panel', 'sport-specific content'],
    } satisfies LiveImage,
    brand: {
      kind: 'image',
      src: '/images/trainr/baseball-brand.jpg',
      alt: 'Trainr branded youth baseball training session',
      tone: 'brand-forward, promotional, aspirational',
      usage: ['auth marketing panel', 'trainer acquisition sections', 'CTA banners'],
    } satisfies LiveImage,
  },
  basketball: {
    hero: {
      kind: 'image',
      src: '/images/trainr/basketball-hero.jpg',
      alt: 'Youth basketball athlete receiving instruction from a trainer',
      tone: 'premium, focused, instructional',
      usage: ['trust sections', 'how-it-works hero', 'profile discovery support'],
    } satisfies LiveImage,
    brand: {
      kind: 'image',
      src: '/images/trainr/basketball-brand.jpg',
      alt: 'Trainr branded basketball coaching visual',
      tone: 'promotional, polished, indoor intensity',
      usage: ['for-trainers hero', 'promo cards', 'trainer signup support'],
    } satisfies LiveImage,
  },
  football: {
    hero: {
      kind: 'image',
      src: '/images/trainr/football-hero.jpg',
      alt: 'Youth football athletes running a coached agility drill on turf',
      tone: 'dynamic, field-led, high-energy',
      usage: ['football collection page', 'homepage sport rail', 'football trainer discovery'],
    } satisfies LiveImage,
    brand: {
      kind: 'image',
      src: '/images/trainr/football-brand.jpg',
      alt: 'Trainr branded football training session on a turf field',
      tone: 'promotional, intense, structured',
      usage: ['football banners', 'promo cards', 'brand-forward campaign slots'],
    } satisfies LiveImage,
  },
  soccer: {
    hero: {
      kind: 'image',
      src: '/images/trainr/soccer-hero.jpg',
      alt: 'Youth soccer athletes working through a coached dribbling drill',
      tone: 'clean, technical, movement-driven',
      usage: ['soccer collection page', 'homepage sport rail', 'soccer trainer discovery'],
    } satisfies LiveImage,
    brand: {
      kind: 'image',
      src: '/images/trainr/soccer-brand.jpg',
      alt: 'Trainr branded youth soccer training drill on grass',
      tone: 'promotional, open-field, energetic',
      usage: ['soccer banners', 'promo cards', 'brand-forward campaign slots'],
    } satisfies LiveImage,
  },
  'track-field': {
    hero: {
      kind: 'image',
      src: '/images/trainr/track-field-hero.jpg',
      alt: 'Youth track athletes sprinting on a marked running track',
      tone: 'fast, disciplined, motion-led',
      usage: ['track & field collection page', 'homepage sport rail', 'performance training discovery'],
    } satisfies LiveImage,
    brand: {
      kind: 'image',
      src: '/images/trainr/track-field-brand.jpg',
      alt: 'Trainr branded youth sprint training visual on a running track',
      tone: 'promotional, high-speed, aspirational',
      usage: ['track & field banners', 'promo cards', 'brand-forward campaign slots'],
    } satisfies LiveImage,
  },
  placeholders: {
    general: {
      kind: 'placeholder',
      label: 'General training visual slot',
      alt: 'Reserved general coaching media slot for future Trainr imagery',
      status: 'not yet available in repo',
      tone: 'neutral premium, versatile, family-safe',
      usage: ['cross-sport collection cards', 'discovery support', 'booking reassurance'],
    } satisfies PlaceholderImage,
  },
} as const

export type TrainrVisual = LiveImage | PlaceholderImage

const SPORT_VISUALS: Record<string, TrainrVisual> = {
  football: {
    kind: 'image',
    src: '/images/trainr/football-bg.jpg',
    alt: 'Youth football coaching session on the field',
    tone: 'clean, action-focused, no text overlay',
    usage: ['sport sections', 'browse page', 'sport cards'],
  },
  baseball: {
    kind: 'image',
    src: '/images/trainr/baseball-bg.jpg',
    alt: 'Youth baseball training session',
    tone: 'clean, action-focused, no text overlay',
    usage: ['sport sections', 'browse page', 'sport cards'],
  },
  basketball: {
    kind: 'image',
    src: '/images/trainr/basketball-bg.jpg',
    alt: 'Youth basketball coaching session',
    tone: 'clean, action-focused, no text overlay',
    usage: ['sport sections', 'browse page', 'sport cards'],
  },
  soccer: {
    kind: 'image',
    src: '/images/trainr/soccer-bg.jpg',
    alt: 'Youth soccer training drill on the pitch',
    tone: 'clean, action-focused, no text overlay',
    usage: ['sport sections', 'browse page', 'sport cards'],
  },
  'track-field': {
    kind: 'image',
    src: '/images/trainr/track-field-bg.jpg',
    alt: 'Youth track and field training',
    tone: 'clean, action-focused, no text overlay',
    usage: ['sport sections', 'browse page', 'sport cards'],
  },
}

export function getSportVisual(slug: string): TrainrVisual {
  return SPORT_VISUALS[slug] || TRAINR_IMAGE_CATALOG.placeholders.general
}

export function isLiveTrainrImage(visual: TrainrVisual): visual is LiveImage {
  return visual.kind === 'image'
}

export function getSportImageSrc(slug: string): string {
  const visual = getSportVisual(slug)
  return visual.kind === 'image' ? visual.src : '/brand/trainr-logo-main.jpg'
}

export function getSportImageAlt(slug: string): string {
  const visual = getSportVisual(slug)
  return visual.alt
}
