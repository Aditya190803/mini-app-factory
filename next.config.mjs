/** @type {import('next').NextConfig} */
const nextConfig = {
  // `typescript.ignoreBuildErrors` used to be set here, which meant a type
  // error shipped instead of failing the build. The tree typechecks clean, so
  // the escape hatch is gone: if `bun run typecheck` passes, so does the build,
  // and if it does not, neither does the build.
  images: {
    unoptimized: true,
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        // The app's own pages. /results and /preview serve generated sites and
        // set their own sandboxing headers (lib/user-content-headers.ts), which
        // these must not override.
        source: '/:path((?!results/|preview/).*)',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Only framing is locked down. A full script CSP needs nonces for the
          // Stack Auth and Convex clients and is its own piece of work.
          { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
        ],
      },
    ]
  },
  async redirects() {
    return [
      // The project list is called Projects everywhere in the interface, so the
      // route says so too. This keeps bookmarks and already-sent links working.
      { source: '/dashboard', destination: '/projects', permanent: true },
    ]
  },
}

export default nextConfig
