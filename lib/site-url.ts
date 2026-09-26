/** The public origin, for absolute URLs in metadata. Never ends in a slash. */
export function siteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://mini-app-factory.adityamer.live'
  return raw.replace(/\/+$/, '')
}
