const PRODUCTION_ORIGIN = 'https://mini-app-factory.adityamer.live'

/**
 * The public origin, for absolute URLs in metadata. Never ends in a slash.
 *
 * Falls back to the host's own preview URL before the production domain, so a preview build's
 * canonical URLs, sitemap and share cards point at the preview rather than at production.
 */
export function siteUrl(): string {
  const vercel = process.env.VERCEL_URL?.trim()
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.CF_PAGES_URL?.trim() ||
    (vercel ? `https://${vercel}` : '') ||
    (process.env.NODE_ENV === 'production' ? PRODUCTION_ORIGIN : 'http://localhost:3000')
  return raw.replace(/\/+$/, '')
}
