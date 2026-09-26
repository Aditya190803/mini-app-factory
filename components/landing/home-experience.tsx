'use client'

import { useUser } from '@stackframe/stack'
import { TopBar, NavLink } from '@/components/shell/top-bar'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { AccountMenu } from '@/components/shell/account-menu'
import { PlateBackdrop } from '@/components/kit'
import { Composer } from '@/components/landing/composer'
import { HeroArtifact } from '@/components/landing/hero-artifact'
import { Bento } from '@/components/landing/bento'
import { Workflow } from '@/components/landing/workflow'
import { Reveal } from '@/components/landing/reveal'
import { RecentProjects } from '@/components/home/recent-projects'

/**
 * The home surface.
 *
 * Signed-in this is a workshop: the composer, then the work already in
 * progress. Signed-out it is the same composer, with the proof of what the
 * factory produces sitting beside and below it. The composer never moves,
 * which is what keeps hydration from shoving the primary action around.
 */
export function HomeExperience() {
  const user = useUser()
  const signedIn = Boolean(user)

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar>
        {signedIn ? (
          <NavLink href="/projects">Projects</NavLink>
        ) : (
          <NavLink href="/about">What it does</NavLink>
        )}
        <NavLink href="/docs">Docs</NavLink>
        <ThemeToggle className="mx-1.5 hidden sm:inline-flex" />
        <AccountMenu />
      </TopBar>

      <main id="main" className="relative w-full max-w-full flex-1 overflow-x-hidden">
        <PlateBackdrop />

        <div className="relative mx-auto w-full max-w-[84rem] px-4 pb-16 pt-10 sm:px-6 sm:pt-12 lg:pt-14">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)] lg:gap-14">
            <div className="min-w-0 max-w-[42rem]">
              <h1 className="text-2xl font-medium tracking-[-0.028em] sm:text-3xl">
                What are you building?
              </h1>
              <p className="mt-2 max-w-[54ch] text-md leading-relaxed text-[var(--muted-foreground)]">
                Plain language in. Real files out. Deployed to your Cloudflare account.
              </p>

              <div className="mt-7">
                <Composer />
              </div>
            </div>

            <aside className={signedIn ? 'min-w-0' : 'hidden min-w-0 lg:block'}>
              {signedIn ? (
                <RecentProjects />
              ) : (
                <HeroArtifact className="lg:translate-y-4 lg:rotate-[-1.1deg]" />
              )}
            </aside>
          </div>

          {!signedIn && (
            <div className="mt-20 space-y-16 md:mt-24 md:space-y-20">
              <Reveal>
                <Workflow />
              </Reveal>

              <Reveal>
                <h2 className="display-md max-w-3xl">Ordinary files. Your Cloudflare account.</h2>
                <p className="mt-3 max-w-[58ch] text-md leading-relaxed text-[var(--muted-foreground)]">
                  The generated project is web files and standard Cloudflare configuration. If you
                  delete this account tomorrow, what you built keeps running.
                </p>
                <div className="mt-8">
                  <Bento />
                </div>
              </Reveal>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
