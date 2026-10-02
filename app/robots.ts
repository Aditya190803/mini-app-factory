import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // Account-bound surfaces. Nothing there is useful to a crawler, and the
      // editor preview is per-user and uncached. Published sites (/results/) are
      // user content on this origin; indexing them lends the app's domain to
      // whatever a user publishes, phishing pages included.
      disallow: ['/api/', '/projects', '/edit/', '/settings', '/admin', '/handler/', '/invite/', '/preview/', '/results/'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
