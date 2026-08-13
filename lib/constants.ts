export const APP_NAME = 'Mini App Factory';

export const APP_DESCRIPTION =
  'Generate production-ready static websites from natural language descriptions';

export const APP_FOOTER_LINKS = [
  { href: '/docs', label: 'Documentation' },
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/eula', label: 'EULA' },
  { href: '/support', label: 'Support' },
] as const;

export const EXAMPLE_PROMPTS = [
    'Bold brutalist portfolio for a creative director featuring case studies and experimental layout',
    'Dark mode SaaS landing page for an AI writing assistant with neon accents and animated hero',
    'Premium e-commerce product page for high-end headphones with interactive 3D showcase',
    'Developer documentation site with dark theme, sidebar navigation, and syntax-highlighted code',
    'Modern agency website with full-screen video hero, client testimonials, and service showcase',
    'Minimalist blog platform with clean typography, dark/light toggle, and category filters',
    'Startup pitch deck website with animated transitions, investor benefits, and contact CTA',
    'Mobile app landing page with feature comparisons, app store links, and user reviews section',
] as const;

export const PROMPT_TEMPLATE_CATEGORIES = [
  {
    id: 'saas-landing',
    category: 'SaaS Landing Page',
    template:
      'Build a [tone] SaaS landing page for [product/company]. Include sections for [sections], use [color style] colors, and highlight [main CTA].',
  },
  {
    id: 'portfolio',
    category: 'Portfolio Website',
    template:
      'Create a [style] portfolio for [person/role]. Include [section list], feature [number] case studies, and use [visual direction] typography.',
  },
  {
    id: 'ecommerce',
    category: 'E-commerce Product Page',
    template:
      'Design an e-commerce page for [product type]. Add [key sections], emphasize [value proposition], and use [brand mood] visuals.',
  },
  {
    id: 'docs-site',
    category: 'Documentation Site',
    template:
      'Generate a documentation site for [product/library]. Include [docs sections], provide [code example type] examples, and keep the tone [tone].',
  },
  {
    id: 'fullstack-saas',
    category: 'Full-stack SaaS',
    template:
      'Build a production SaaS for [audience] that solves [problem]. Include a responsive dashboard, onboarding, billing-ready account settings, a Cloudflare Worker JSON API, D1 migrations, validation, error states, and secure authentication using [Clerk/Auth0/WorkOS/Supabase Auth]. Never implement password storage or session tokens manually.',
  },
  {
    id: 'booking-platform',
    category: 'Booking Platform',
    template:
      'Build a booking platform for [business type]. Include availability, timezone-aware scheduling, customer details, confirmation states, an admin view, a Worker API, D1 persistence, idempotent booking creation, and [authentication provider] authentication.',
  },
  {
    id: 'crm-admin',
    category: 'CRM and Admin',
    template:
      'Build a CRM for [team type]. Include contacts, organizations, pipeline stages, search, filters, activity history, CSV import/export, role-aware navigation, a Cloudflare Worker API, D1 schema and migrations, and [authentication provider] authentication.',
  },
  {
    id: 'ai-product',
    category: 'AI Application',
    template:
      'Build an AI application for [use case]. Include prompt history, streaming result states, usage limits, saved outputs, secure server-side provider calls, a Worker API, D1 persistence, queue-backed long-running work with idempotency, and [authentication provider] authentication.',
  },
  {
    id: 'customer-portal',
    category: 'Customer Portal',
    template:
      'Build a secure customer portal for [company type]. Include profile management, documents stored in R2, support requests, account activity, responsive empty/error states, signed download URLs, D1 persistence, and [authentication provider] authentication with protected routes.',
  },
] as const;
