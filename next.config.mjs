/** @type {import('next').NextConfig} */
const nextConfig = {
  // `typescript.ignoreBuildErrors` used to be set here, which meant a type
  // error shipped instead of failing the build. The tree typechecks clean, so
  // the escape hatch is gone: if `bun run typecheck` passes, so does the build,
  // and if it does not, neither does the build.
  images: {
    unoptimized: true,
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
