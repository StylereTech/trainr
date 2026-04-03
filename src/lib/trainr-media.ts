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
    /** Clean — coach instructing player at base with cones */
    hero: {
      kind: 'image',
      src: '/images/trainr/baseball-hero.jpg',
      alt: 'Coach instructing a young baseball player at the base during practice',
      tone: 'warm, instructional, one-on-one coaching',
      usage: ['sport cards', 'browse sections', 'trainer profiles'],
    } satisfies LiveImage,
    /** Branded — "Train Smart Play Strong" baseball coaching */
    brand: {
      kind: 'image',
      src: '/images/trainr/baseball-brand.jpg',
      alt: 'Trainr branded baseball coaching session with youth player at base',
      tone: 'branded, coaching-focused, trust-building',
      usage: ['auth hero', 'baseball banner', 'CTA sections'],
    } satisfies LiveImage,
    /** Clean — green team coach talking to batter */
    heroAlt: {
      kind: 'image',
      src: '/images/trainr/baseball-hero-alt.jpg',
      alt: 'Baseball coach talking with young batter at the plate',
      tone: 'mentorship, game-day coaching, personal attention',
      usage: ['sport cards', 'testimonials'],
    } satisfies LiveImage,
    /** Branded — green team coach + batter with Trainr logo */
    brandAlt: {
      kind: 'image',
      src: '/images/trainr/baseball-brand-alt.jpg',
      alt: 'Trainr branded baseball coach mentoring young batter',
      tone: 'branded, mentorship, team atmosphere',
      usage: ['baseball banners', 'promo cards'],
    } satisfies LiveImage,
  },
  basketball: {
    /** Clean — youth players practicing shooting form */
    hero: {
      kind: 'image',
      src: '/images/trainr/basketball-hero.jpg',
      alt: 'Youth basketball players practicing shooting form in a gymnasium',
      tone: 'team energy, disciplined practice, indoor',
      usage: ['sport cards', 'browse sections', 'how-it-works'],
    } satisfies LiveImage,
    /** Branded — shooting drill line with Trainr logo */
    brand: {
      kind: 'image',
      src: '/images/trainr/basketball-brand.jpg',
      alt: 'Trainr branded basketball shooting drill with youth players in formation',
      tone: 'branded, team discipline, premium coaching',
      usage: ['basketball banner', 'CTA sections', 'for-trainers'],
    } satisfies LiveImage,
    /** Branded — 1-on-1 coach instruction */
    brandAlt: {
      kind: 'image',
      src: '/images/trainr/basketball-brand-alt.jpg',
      alt: 'Trainr branded one-on-one basketball coaching session',
      tone: 'branded, personal instruction, focused',
      usage: ['trainer acquisition', 'promo cards'],
    } satisfies LiveImage,
    /** Clean — 1-on-1 coach guiding shooting form */
    heroCoaching: {
      kind: 'image',
      src: '/images/trainr/basketball-hero-coaching.jpg',
      alt: 'Basketball coach guiding young player shooting form in gym',
      tone: 'personal coaching, focused instruction',
      usage: ['trainer profiles', 'sport detail'],
    } satisfies LiveImage,
  },
  football: {
    /** Clean — golden hour three-point stance */
    hero: {
      kind: 'image',
      src: '/images/trainr/football-hero.jpg',
      alt: 'Football player in golden hour three-point stance on the field',
      tone: 'dynamic, game-ready, golden hour intensity',
      usage: ['sport cards', 'browse sections', 'homepage'],
    } satisfies LiveImage,
    /** Branded — golden hour three-point stance with Trainr logo */
    brand: {
      kind: 'image',
      src: '/images/trainr/football-brand.jpg',
      alt: 'Trainr branded football player in three-point stance at golden hour',
      tone: 'branded, cinematic, premium',
      usage: ['football banner', 'hero sections', 'sports page'],
    } satisfies LiveImage,
    /** Branded — Coach Copeland agility drill on turf */
    brandAlt: {
      kind: 'image',
      src: '/images/trainr/football-brand-alt.jpg',
      alt: 'Trainr branded youth football agility drill with coach on turf field',
      tone: 'branded, high-energy, team training',
      usage: ['homepage hero', 'football CTA'],
    } satisfies LiveImage,
    /** Clean — youth player stretching with helmet */
    heroAlt: {
      kind: 'image',
      src: '/images/trainr/football-hero-alt.jpg',
      alt: 'Youth football player in full gear stretching on grass field',
      tone: 'preparation, youth sport, golden light',
      usage: ['sport cards', 'secondary football visuals'],
    } satisfies LiveImage,
    /** Branded — youth player stretching with logo */
    brandStretch: {
      kind: 'image',
      src: '/images/trainr/football-brand-stretch.jpg',
      alt: 'Trainr branded youth football player stretching before practice',
      tone: 'branded, preparation, dedication',
      usage: ['football promo', 'CTA backgrounds'],
    } satisfies LiveImage,
  },
  soccer: {
    /** Clean — coach watching kids do cone drills on grass */
    hero: {
      kind: 'image',
      src: '/images/trainr/soccer-hero.jpg',
      alt: 'Youth soccer players practicing cone dribbling drills on grass field',
      tone: 'clean, technical, outdoor training',
      usage: ['sport cards', 'browse sections', 'soccer discovery'],
    } satisfies LiveImage,
    /** Branded — same soccer drill with Trainr logo */
    brand: {
      kind: 'image',
      src: '/images/trainr/soccer-brand.jpg',
      alt: 'Trainr branded youth soccer training session with cone drills',
      tone: 'branded, coaching atmosphere, grassroots',
      usage: ['soccer banner', 'promo cards', 'CTA sections'],
    } satisfies LiveImage,
    /** Clean — boy running through orange cones (square format) */
    heroAlt: {
      kind: 'image',
      src: '/images/trainr/soccer-hero-alt.jpg',
      alt: 'Boy running through orange agility cones on soccer field',
      tone: 'action, agility, solo training',
      usage: ['sport cards', 'mobile thumbnails'],
    } satisfies LiveImage,
  },
  'track-field': {
    hero: {
      kind: 'image',
      src: '/images/trainr/track-field-hero.jpg',
      alt: 'Youth track athletes sprinting on a marked running track',
      tone: 'fast, disciplined, motion-led',
      usage: ['sport cards', 'track & field collection page'],
    } satisfies LiveImage,
    brand: {
      kind: 'image',
      src: '/images/trainr/track-field-brand.jpg',
      alt: 'Trainr branded youth sprint training on a running track',
      tone: 'branded, high-speed, aspirational',
      usage: ['track & field banners', 'promo cards'],
    } satisfies LiveImage,
  },
  custom: {
    /** Branded — indoor turf multi-sport (homepage hero) */
    homeHero: {
      kind: 'image',
      src: '/images/trainr/custom/home-hero-logo.jpg',
      alt: 'Trainr branded youth athletes training on indoor turf',
      tone: 'branded, multi-sport, premium homepage feel',
      usage: ['homepage hero background'],
    } satisfies LiveImage,
    /** Clean — indoor turf training (signup hero) */
    signupHero: {
      kind: 'image',
      src: '/images/trainr/custom/signup-hero.jpg',
      alt: 'Youth athletes training together on indoor turf field',
      tone: 'clean, welcoming, multi-sport energy',
      usage: ['signup page hero panel'],
    } satisfies LiveImage,
    /** Branded — coach teaching tennis technique */
    coachingBranded: {
      kind: 'image',
      src: '/images/trainr/custom/coaching-branded.jpg',
      alt: 'Trainr branded coach guiding young athlete on proper technique',
      tone: 'branded, mentorship, trust-forward',
      usage: ['for-trainers page', 'how-it-works', 'about'],
    } satisfies LiveImage,
    /** Clean — coach shaking hands with kids */
    coachingClean: {
      kind: 'image',
      src: '/images/trainr/custom/coaching-clean.jpg',
      alt: 'Coach shaking hands with young athlete on the court',
      tone: 'warm, welcoming, trust-building moment',
      usage: ['testimonials', 'trust sections', 'about'],
    } satisfies LiveImage,
    /** Clean — father and son doing pushups together in gym */
    fitnessGeneral: {
      kind: 'image',
      src: '/images/trainr/custom/fitness-general.jpg',
      alt: 'Coach and young athlete doing pushups together in the gym',
      tone: 'fun, bonding, fitness-first',
      usage: ['how-it-works', 'general training', 'about'],
    } satisfies LiveImage,
    /** Branded — soccer boy running cones (square format) */
    soccerBrandSquare: {
      kind: 'image',
      src: '/images/trainr/custom/soccer-brand-square.jpg',
      alt: 'Trainr branded youth soccer agility drill through orange cones',
      tone: 'branded, action, agility-focused',
      usage: ['social media', 'mobile featured'],
    } satisfies LiveImage,
  },
  placeholders: {
    general: {
      kind: 'placeholder',
      label: 'General training visual slot',
      alt: 'Reserved general coaching media slot for future Trainr imagery',
      status: 'not yet available in repo',
      tone: 'neutral premium, versatile, family-safe',
      usage: ['cross-sport collection cards', 'discovery support'],
    } satisfies PlaceholderImage,
  },
} as const

export type TrainrVisual = LiveImage | PlaceholderImage

const SPORT_VISUALS: Record<string, TrainrVisual> = {
  football: TRAINR_IMAGE_CATALOG.football.hero,
  baseball: TRAINR_IMAGE_CATALOG.baseball.hero,
  basketball: TRAINR_IMAGE_CATALOG.basketball.hero,
  soccer: TRAINR_IMAGE_CATALOG.soccer.hero,
  'track-field': TRAINR_IMAGE_CATALOG['track-field'].hero,
}

export function getSportVisual(slug: string): TrainrVisual {
  return SPORT_VISUALS[slug] || TRAINR_IMAGE_CATALOG.placeholders.general
}

export function isLiveTrainrImage(visual: TrainrVisual): visual is LiveImage {
  return visual.kind === 'image'
}
