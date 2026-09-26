import type { MetadataRoute } from 'next'
import { siteUrl } from '@/lib/site-url'

const PAGES: Array<{ path: string; priority: number }> = [
  { path: '/', priority: 1 },
  { path: '/about', priority: 0.8 },
  { path: '/docs', priority: 0.8 },
  { path: '/support', priority: 0.5 },
  { path: '/privacy', priority: 0.3 },
  { path: '/eula', priority: 0.3 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  return PAGES.map(({ path, priority }) => ({ url: `${base}${path}`, priority }))
}
