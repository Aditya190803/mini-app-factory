import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Account-bound surfaces. Nothing there is useful to a crawler, and the
      // editor preview is per-user and uncached.
      disallow: ['/api/', '/projects', '/edit/', '/settings', '/admin', '/handler/', '/invite/', '/preview/'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
