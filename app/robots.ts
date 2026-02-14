import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/handler/', '/admin/', '/settings/'],
      },
    ],
    sitemap: 'https://miniappfactory.vercel.app/sitemap.xml',
  }
}
