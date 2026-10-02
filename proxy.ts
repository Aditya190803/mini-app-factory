import { NextResponse, type NextRequest } from 'next/server'

/**
 * Content Security Policy for the app's own pages.
 *
 * A fresh nonce per request goes to the page through the `x-nonce` request header. The policy is
 * sent as Content-Security-Policy-Report-Only unless CSP_ENFORCE=1, so it can be watched in the
 * browser console (and any report collector) before it starts blocking: Stack Auth, Convex and the
 * theme script all run on these pages, and a policy that blocks one of them takes sign-in down.
 * Enforcing also requires dynamic rendering, which the root layout switches on with the same flag.
 *
 * The editor (/edit/*) gets no script restrictions: its preview renders the generated app in a
 * `srcdoc` iframe, which inherits this page's policy, and the generated app's inline scripts would
 * be blocked. That iframe is sandboxed without allow-same-origin, which is what contains it.
 * /results and /preview serve user content with their own sandbox headers.
 */
function connectSources() {
  const sources = new Set(["'self'", 'https://api.stack-auth.com', 'https://*.stack-auth.com'])
  const convex = process.env.NEXT_PUBLIC_CONVEX_URL
  if (convex) {
    try {
      const url = new URL(convex)
      sources.add(url.origin)
      sources.add(`wss://${url.host}`)
    } catch {
      // A malformed URL fails elsewhere, loudly.
    }
  }
  return [...sources].join(' ')
}

function policy(nonce: string, editor: boolean) {
  const isDev = process.env.NODE_ENV === 'development'
  const scripts = editor
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:"
    : `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`
  return [
    "default-src 'self'",
    scripts,
    // Style attributes (and Tailwind's runtime-free output) cannot carry nonces.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSources()}`,
    "worker-src 'self' blob:",
    "frame-src 'self' https:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://*.stack-auth.com",
    "frame-ancestors 'self'",
  ].join('; ')
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const value = policy(nonce, request.nextUrl.pathname.startsWith('/edit/'))
  const header = process.env.CSP_ENFORCE === '1' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only'

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set(header, value)

  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set(header, value)
  return response
}

export const config = {
  matcher: [
    {
      // Pages only: not API routes, static assets, Monaco, or the user-content routes.
      source: '/((?!api/|_next/static|_next/image|monaco/|results/|preview/|favicon.ico|robots.txt|sitemap.xml).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
