export const APP_NAME = 'Mini App Factory'

export const APP_DESCRIPTION =
  'Describe an application in plain language, read the files it produces, then publish it to Cloudflare.'

export const APP_TAGLINE = 'Cloudflare-first app factory'

export type FooterLink = { href: string; label: string }
export type FooterGroup = { title: string; links: ReadonlyArray<FooterLink> }

export const APP_FOOTER_GROUPS: ReadonlyArray<FooterGroup> = [
  {
    title: 'Product',
    links: [
      { href: '/dashboard', label: 'Projects' },
      { href: '/docs', label: 'Documentation' },
      { href: '/settings', label: 'Settings' },
    ],
  },
  {
    title: 'Platform',
    links: [
      { href: '/about', label: 'What it does' },
      { href: '/docs#targets', label: 'Static and edge' },
      { href: '/docs#manifest', label: 'The manifest' },
      { href: '/docs#deploy', label: 'Deploying' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/eula', label: 'EULA' },
      { href: '/support', label: 'Support' },
    ],
  },
]

/** Flat list, kept for surfaces that want a single row of links. */
export const APP_FOOTER_LINKS: ReadonlyArray<FooterLink> = APP_FOOTER_GROUPS.flatMap(
  (group) => group.links
)

/**
 * Starters, split by build target.
 *
 * Each one is written the way a user actually asks for something: the outcome,
 * not a list of adjectives. The static examples never imply stored data; the
 * edge examples always do, because that is the line between the two targets
 * and the examples are where most people will first notice it.
 */
export const STATIC_STARTERS = [
  'A one page site for a bike repair shop with opening hours, prices, and a map',
  'A conference schedule site with a filterable agenda and speaker pages',
  'A documentation site for a small Python library, with a sidebar and code samples',
  'A portfolio for a furniture maker: project pages, large photography, a contact form that mails me',
] as const

export const EDGE_STARTERS = [
  'A tool that tracks freelance invoices, flags the overdue ones, and charts monthly income',
  'A link shortener with a dashboard showing clicks per day and per country',
  'A reading list where I paste a URL and it saves the title, and I can tag and search later',
  'An internal on-call roster: who is on this week, swap requests, and a weekly email',
] as const

export const EXAMPLE_PROMPTS = [...STATIC_STARTERS, ...EDGE_STARTERS] as const

/**
 * What the landing page claims the product does, stated as verifiable
 * mechanics rather than benefits. Each line maps to something the user can go
 * and check in the editor.
 */
export const CAPABILITY_SPECS = [
  { key: 'Output', value: 'HTML, CSS, browser JS, and for edge apps a Worker plus SQL migrations' },
  { key: 'Host', value: 'Cloudflare Pages and Workers, published from your own account' },
  { key: 'Data', value: 'D1, KV, R2, Queues, Vectorize, Durable Objects, declared in a manifest' },
  { key: 'Preview', value: 'A throwaway Cloudflare deployment on its own subdomain, expires on its own' },
  { key: 'Versions', value: 'Every successful build is kept and can be restored' },
  { key: 'Export', value: 'A zip of the same files, or a push to a GitHub repo you own' },
] as const
