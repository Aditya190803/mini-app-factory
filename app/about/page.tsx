import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Wordmark } from '@/components/brand/mark'
import { Button, PlateBackdrop } from '@/components/kit'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { AccountMenu } from '@/components/shell/account-menu'
import { HeroArtifact } from '@/components/landing/hero-artifact'
import { Bento } from '@/components/landing/bento'

export const metadata: Metadata = {
  title: 'What it does',
  description:
    'Describe an application in plain language, read the files it produces, and publish them to your own Cloudflare account.',
}

/**
 * The explanatory page.
 *
 * Deliberately short. Someone lands here from the app wanting to know what
 * this is, and they will decide inside two screens. It used to run to six
 * full-viewport sections, which was five more than the idea needs: a pinned
 * scroll sequence, a services accordion, and an examples carousel all restated
 * the same claim at length.
 *
 * What is left is the claim, one dense block that proves it, and a way in.
 * Anything that wants more detail belongs in the docs, which is one link away.
 */
export default function AboutPage() {
  return (
    <main id="main" className="w-full max-w-full overflow-x-hidden">
      <header className="sticky top-0 z-[var(--z-sticky)] border-b border-[var(--rule)] bg-[var(--background)]">
        <div className="mx-auto flex h-[var(--bar-h)] w-full max-w-[84rem] items-center justify-between gap-4 px-4 sm:px-6">
          <Link
            href="/"
            className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            <Wordmark />
          </Link>

          <nav aria-label="Main" className="flex items-center gap-1">
            <Link
              href="/docs"
              className="rounded-md px-2.5 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              Docs
            </Link>
            <ThemeToggle className="mx-1.5 hidden sm:inline-flex" />
            <Button intent="primary" size="sm" asChild>
              <Link href="/">Open the factory</Link>
            </Button>
            <AccountMenu className="ml-1" />
          </nav>
        </div>
      </header>

      <section className="relative">
        <PlateBackdrop />
        <div className="relative mx-auto w-full max-w-[84rem] px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:pb-28">
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
            <div className="max-w-5xl">
              <h1 className="display-xl">Describe it once. Ship it to the edge.</h1>
              <p className="mt-6 max-w-[54ch] text-lg leading-relaxed text-[var(--muted-foreground)]">
                Write what you want in plain language. You get real files you can read, a preview you
                can click through, and a deployment into your own Cloudflare account. Static sites
                and full edge apps, from the same sentence.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button intent="primary" size="lg" asChild>
                  <Link href="/">
                    Start building
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" asChild>
                  <Link href="/docs">Read the docs</Link>
                </Button>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <HeroArtifact className="lg:translate-y-8 lg:rotate-[-1.2deg]" />
            </div>
          </div>
        </div>
      </section>

      <section className="pb-20 md:pb-28">
        <div className="mx-auto w-full max-w-[84rem] px-4 sm:px-6">
          <h2 className="display-lg max-w-3xl">Not a black box. A directory you can open.</h2>
          <p className="mt-4 max-w-[58ch] text-md leading-relaxed text-[var(--muted-foreground)]">
            The generated project is ordinary web files and standard Cloudflare configuration. If you
            delete this account tomorrow, what you built keeps running.
          </p>
          <div className="mt-9">
            <Bento />
          </div>
        </div>
      </section>

      {/* A ruled strip, not another full-height chapter. */}
      <section className="border-t border-[var(--rule)]">
        <div className="mx-auto flex w-full max-w-[84rem] flex-wrap items-center justify-between gap-5 px-4 py-12 sm:px-6">
          <div className="min-w-0">
            <h2 className="display-md">Start with one sentence.</h2>
            <p className="mt-2 max-w-[48ch] text-sm leading-relaxed text-[var(--muted-foreground)]">
              You connect Cloudflare only when you are ready to publish.
            </p>
          </div>
          <Button intent="primary" size="lg" asChild>
            <Link href="/">
              Open the factory
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  )
}
