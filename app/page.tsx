import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Wordmark } from '@/components/brand/mark'
import { Button, PlateBackdrop } from '@/components/kit'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { AccountMenu } from '@/components/shell/account-menu'
import { Composer } from '@/components/landing/composer'
import { HeroArtifact } from '@/components/landing/hero-artifact'
import { Bento } from '@/components/landing/bento'
import { ServicesAccordion } from '@/components/landing/services-accordion'
import { EdgeScroll } from '@/components/landing/edge-scroll'
import { Showcase } from '@/components/landing/showcase'

/**
 * The landing page.
 *
 * Brand register, so it is allowed things the product surfaces are not: a mono
 * display face at five rem, sections that are a whole viewport apart, and one
 * genuinely orchestrated scroll sequence. What it is still not allowed is a
 * claim it cannot back, so every number and every capability on this page
 * corresponds to something the editor actually shows you.
 *
 * Structure, in order: split nav, an asymmetric hero with the composer, the
 * bento, the Cloudflare services accordion, the pinned scroll sequence, the
 * worked examples, and the closing action.
 */
export default function LandingPage() {
  return (
    <main id="main" className="w-full max-w-full overflow-x-hidden">
      {/* Split nav: mark on one side, everything else on the other, divided by
          a full-width rule rather than a floating pill. */}
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
            <Link
              href="/dashboard"
              className="rounded-md px-2.5 py-1.5 text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
            >
              Projects
            </Link>
            <ThemeToggle className="mx-1.5 hidden sm:inline-flex" />
            <AccountMenu />
          </nav>
        </div>
      </header>

      {/* ---- Attention -------------------------------------------------- */}
      <section className="relative">
        <PlateBackdrop />
        <div className="relative mx-auto w-full max-w-[84rem] px-4 pb-28 pt-16 sm:px-6 sm:pt-24 lg:pb-40">
          <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-8">
            {/* Text offset left, wide enough that the headline stays on two lines. */}
            <div className="max-w-5xl">
              <h1 className="display-xl">
                Describe it once. Ship it to the edge.
              </h1>
              <p className="mt-7 max-w-[54ch] text-lg leading-relaxed text-[var(--muted-foreground)]">
                Write what you want in plain language. You get real files you can read, a preview you
                can click through, and a deployment into your own Cloudflare account. Static sites
                and full edge apps, from the same sentence.
              </p>

              <div className="mt-10 max-w-2xl">
                <Composer />
              </div>
            </div>

            {/* The artifact, floated and overlapping the text block's baseline. */}
            <div className="relative hidden lg:block">
              <HeroArtifact className="lg:translate-y-14 lg:rotate-[-1.2deg] xl:translate-x-6" />
            </div>
          </div>
        </div>
      </section>

      {/* ---- Interest --------------------------------------------------- */}
      <section className="py-28 md:py-40">
        <div className="mx-auto w-full max-w-[84rem] px-4 sm:px-6">
          <h2 className="display-lg max-w-4xl">
            Not a black box. A directory you can open.
          </h2>
          <p className="mt-5 max-w-[58ch] text-md leading-relaxed text-[var(--muted-foreground)]">
            The generated project is ordinary web files and standard Cloudflare configuration. If
            you delete this account tomorrow, what you built keeps running.
          </p>
          <div className="mt-12">
            <Bento />
          </div>
        </div>
      </section>

      <section className="pb-28 md:pb-40">
        <div className="mx-auto w-full max-w-[84rem] px-4 sm:px-6">
          <h2 className="display-lg max-w-3xl">Cloudflare first, all the way down</h2>
          <p className="mt-5 max-w-[58ch] text-md leading-relaxed text-[var(--muted-foreground)]">
            Every service an edge app can reach, and the binding name it reaches it by.
          </p>
          <div className="mt-12">
            <ServicesAccordion />
          </div>
        </div>
      </section>

      {/* ---- Desire ----------------------------------------------------- */}
      <section className="border-y border-[var(--rule)] bg-[var(--surface-2)] py-28 md:py-44">
        <EdgeScroll />
      </section>

      <section className="py-28 md:py-40">
        <Showcase />
      </section>

      {/* ---- Action ----------------------------------------------------- */}
      <section className="relative border-t border-[var(--rule)]">
        <PlateBackdrop />
        <div className="relative mx-auto w-full max-w-[84rem] px-4 py-32 sm:px-6 md:py-48">
          <div className="max-w-4xl">
            <h2 className="display-xl">Start with one sentence.</h2>
            <p className="mt-7 max-w-[52ch] text-lg leading-relaxed text-[var(--muted-foreground)]">
              No account is needed to see what it produces. You connect Cloudflare only when you are
              ready to publish.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Button intent="primary" size="lg" asChild>
                <Link href="#main">
                  Open the composer
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" asChild>
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
