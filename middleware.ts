import { NextResponse } from 'next/server';

export function middleware() {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const response = NextResponse.next();
  const isProduction = process.env.NODE_ENV === 'production';
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://fonts.googleapis.com https://cdnjs.cloudflare.com`
    : `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' 'strict-dynamic' https://fonts.googleapis.com https://cdnjs.cloudflare.com`;

  // Expose nonce to server components via custom header
  response.headers.set('x-nonce', nonce);

  // CSP: nonce-based script-src. For styles, allow inline only on style attributes
  // (framer-motion + existing inline style props), while keeping style elements strict.
  const csp = [
    `default-src 'self'`,
    scriptSrc,
    `style-src 'self' https://fonts.googleapis.com`,
    `style-src-elem 'self' https://fonts.googleapis.com`,
    `style-src-attr 'unsafe-inline'`,
    `font-src 'self' https://fonts.gstatic.com`,
    `img-src 'self' data: https:`,
    `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://api.stack-auth.com https://*.ingest.us.sentry.io`,
    `frame-ancestors 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
  ].join('; ');

  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt
     * - API routes (they set their own headers)
     */
    {
      source: '/((?!_next/static|_next/image|favicon\\.ico|sitemap\\.xml|robots\\.txt|api/).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
