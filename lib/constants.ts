export const APP_NAME = 'Mini App Factory'

export const APP_DESCRIPTION =
  'Describe an application in plain language, read the files it produces, then publish it to Cloudflare.'

export type FooterLink = { href: string; label: string }
export type FooterGroup = { title: string; links: ReadonlyArray<FooterLink> }

export const APP_FOOTER_GROUPS: ReadonlyArray<FooterGroup> = [
  {
    title: 'Product',
    links: [
      { href: '/projects', label: 'Projects' },
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
const STATIC_STARTERS = [
  'A one page site for a bike repair shop with opening hours, prices, and a map',
  'A conference schedule site with a filterable agenda and speaker pages',
  'A documentation site for a small Python library, with a sidebar and code samples',
  'A portfolio for a furniture maker: project pages, large photography, a contact form that mails me',
] as const

const EDGE_STARTERS = [
  'A tool that tracks freelance invoices, flags the overdue ones, and charts monthly income',
  'A link shortener with a dashboard showing clicks per day and per country',
  'A reading list where I paste a URL and it saves the title, and I can tag and search later',
  'An internal on-call roster: who is on this week, swap requests, and a weekly email',
] as const

/** Starters shown in the composer: some of each target, so edge apps are discoverable. */
export const COMPOSER_STARTERS: ReadonlyArray<{ prompt: string; target: 'static' | 'edge' }> = [
  { prompt: STATIC_STARTERS[0], target: 'static' },
  { prompt: STATIC_STARTERS[1], target: 'static' },
  { prompt: EDGE_STARTERS[0], target: 'edge' },
  { prompt: EDGE_STARTERS[2], target: 'edge' },
]

/**
 * Edge templates: one per storage primitive, written precisely enough that the generated app
 * exercises the binding end to end. Picking one sets the build target to edge.
 */
export const EDGE_TEMPLATES: ReadonlyArray<{ label: string; detail: string; prompt: string }> = [
  {
    label: 'Database app (D1)',
    detail: 'Create, list, edit and delete records stored in D1.',
    prompt:
      'A small inventory tracker backed by a D1 database: a table of items with name, quantity and location; add, edit and delete items; search by name; and a migration that creates the table. Expose the data through /api/items routes in the Worker.',
  },
  {
    label: 'Form with storage (KV)',
    detail: 'A form whose submissions are kept in KV and listed back.',
    prompt:
      'An event RSVP page: a form for name, email and number of guests that stores each response in a KV namespace, plus a password-protected /admin page that lists the responses and the guest total. Keep the password in a Worker secret.',
  },
  {
    label: 'File uploads (R2)',
    detail: 'Upload files to an R2 bucket and browse them.',
    prompt:
      'A shared file drop: upload images and PDFs up to 10 MB to an R2 bucket through the Worker, list uploaded files with their size and date, and download or delete them. Reject other file types.',
  },
]

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
