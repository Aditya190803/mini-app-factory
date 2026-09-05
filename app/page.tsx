import Link from 'next/link'
import { TopBar, NavLink } from '@/components/shell/top-bar'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { AccountMenu } from '@/components/shell/account-menu'
import { Composer } from '@/components/landing/composer'
import { RecentProjects } from '@/components/home/recent-projects'
import { TARGET_ORDER, TARGETS } from '@/lib/targets'

/**
 * The home page.
 *
 * This is a working surface, not a landing page. It is the first thing someone
 * opens when they sit down to build, and the great majority of visits are
 * returning users who want the composer and their recent work, not a pitch.
 * The pitch lives at /about.
 *
 * So: product register. The composer is the page, it is above the fold, it is
 * focused on load, and the recent-projects rail sits beside it. Nothing
 * animates in, nothing needs scrolling past. The only supporting content is a
 * two-line note on the one decision the composer asks you to make.
 */
export default function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar>
        <NavLink href="/about">What it does</NavLink>
        <NavLink href="/docs">Docs</NavLink>
        <NavLink href="/dashboard">Projects</NavLink>
        <ThemeToggle className="mx-1.5 hidden sm:inline-flex" />
        <AccountMenu />
      </TopBar>

      <main id="main" className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-10 sm:px-6 lg:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] lg:gap-12">
          <div className="min-w-0">
            <h1 className="text-2xl font-medium tracking-[-0.024em]">What are you building?</h1>
            <p className="mt-1.5 max-w-[62ch] text-sm text-[var(--muted-foreground)]">
              Describe it in plain language. You get the files, a preview you can click through, and
              a deploy to your own Cloudflare account when you are ready.
            </p>

            <div className="mt-6">
              <Composer />
            </div>

            {/* The one decision the composer asks for, explained where it is
                asked rather than in a tooltip. Two cells, ruled, no icons. */}
            <div className="mt-10">
              <h2 className="key">The two shapes</h2>
              <dl className="mt-3 grid gap-px overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--rule)] sm:grid-cols-2">
                {TARGET_ORDER.map((id) => {
                  const spec = TARGETS[id]
                  return (
                    <div key={id} className="bg-[var(--surface-1)] p-3.5">
                      <dt className="font-mono text-sm tracking-[-0.03em]">{spec.label}</dt>
                      <dd className="mt-1 text-xs leading-relaxed text-[var(--muted-foreground)]">
                        {spec.summary}
                        <span className="mt-1.5 block text-[var(--muted-foreground)]">
                          {spec.provisions}
                        </span>
                      </dd>
                    </div>
                  )
                })}
              </dl>
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                Leave it on <span className="text-[var(--foreground)]">Decide for me</span> and the
                description settles it. You can see which one you got in the editor, and it updates
                itself if the project grows a backend.{' '}
                <Link
                  href="/docs#targets"
                  className="rounded text-[var(--signal-text)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  More in the docs
                </Link>
                .
              </p>
            </div>
          </div>

          <aside className="min-w-0 lg:border-l lg:border-[var(--rule)] lg:pl-8">
            <RecentProjects />
          </aside>
        </div>
      </main>
    </div>
  )
}
