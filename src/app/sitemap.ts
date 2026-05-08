import type { MetadataRoute } from 'next'

const BASE_URL = 'https://trainr.cc'

const staticRoutes = [
  '',
  '/about',
  '/browse',
  '/contact',
  '/faq',
  '/for-trainers',
  '/how-it-works',
  '/sports',
  '/auth/signin',
  '/auth/signup',
  '/legal/privacy',
  '/legal/terms',
  '/legal/refunds',
  '/legal/safety',
  '/legal/cookies',
]

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  return staticRoutes.map((route) => ({
    url: `${BASE_URL}${route}`,
    lastModified: now,
    changeFrequency: route === '' ? 'weekly' : 'monthly',
    priority: route === '' ? 1 : route.startsWith('/legal') ? 0.2 : 0.7,
  }))
}
