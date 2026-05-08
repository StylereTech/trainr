import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api', '/dashboard', '/messages', '/parent', '/trainer/dashboard', '/trainer/profile'],
    },
    sitemap: 'https://trainr.cc/sitemap.xml',
  }
}
