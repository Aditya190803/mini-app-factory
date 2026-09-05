'use client'

import * as React from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'
import { cn } from '@/lib/utils'

gsap.registerPlugin(ScrollTrigger, useGSAP)

/**
 * The pinned split.
 *
 * The heading holds still on the left while the stages move past it on the
 * right, which is the only motion on this page that carries meaning: the point
 * being made is that one description travels through four fixed stages, and
 * pinning the heading is what makes the travelling visible.
 *
 * Each plate scales from 0.88 to 1 as it arrives and fades back as it leaves,
 * so the one being read is always the one at full size.
 *
 * The whole effect is gated on prefers-reduced-motion. With motion reduced the
 * section renders as a plain two-column list, which is a complete experience
 * rather than a degraded one.
 */

type Stage = {
  id: string
  title: string
  body: string
  /** Treated heavily, so it reads as texture rather than as a stock photo. */
  image: string
  facts: Array<[string, string]>
}

const STAGES: Stage[] = [
  {
    id: 'describe',
    title: 'Describe',
    body: 'Write the application in plain language. Point at a site if you want its layout and palette used as a cue.',
    image: 'https://picsum.photos/seed/drafting-table/1600/1000',
    facts: [
      ['Input', 'One paragraph'],
      ['Optional', 'A reference URL'],
    ],
  },
  {
    id: 'inspect',
    title: 'Inspect',
    body: 'Read every file it wrote. Click through the preview, edit anything by hand, and ask for changes in the same thread.',
    image: 'https://picsum.photos/seed/blueprint-plans/1600/1000',
    facts: [
      ['Editor', 'Full file tree'],
      ['History', 'Every build kept'],
    ],
  },
  {
    id: 'provision',
    title: 'Provision',
    body: 'An edge app declares its bindings in a manifest. You see the exact list of resources before a single one is created.',
    image: 'https://picsum.photos/seed/server-rack-steel/1600/1000',
    facts: [
      ['Creates', 'D1, KV, R2, Queues'],
      ['Gate', 'Explicit confirmation'],
    ],
  },
  {
    id: 'publish',
    title: 'Publish',
    body: 'The bundle goes to Cloudflare Pages in your own account. Static sites stop there; edge apps also get their Worker.',
    image: 'https://picsum.photos/seed/fibre-optic-dark/1600/1000',
    facts: [
      ['Host', 'Your Cloudflare account'],
      ['Export', 'Zip or GitHub repo'],
    ],
  },
]

export function EdgeScroll({ className }: { className?: string }) {
  const root = React.useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      // Pinning a column against a scrolling one only makes sense when there
      // are two columns. Below the breakpoint the section is a plain list.
      if (!window.matchMedia('(min-width: 1024px)').matches) return

      const scope = root.current
      if (!scope) return

      ScrollTrigger.create({
        trigger: scope,
        start: 'top top+=64',
        end: 'bottom bottom-=40%',
        pin: scope.querySelector('[data-pin]'),
        pinSpacing: false,
      })

      scope.querySelectorAll<HTMLElement>('[data-stage]').forEach((stage) => {
        const figure = stage.querySelector('[data-figure]')
        if (!figure) return

        gsap.fromTo(
          figure,
          { scale: 0.88, opacity: 0.25 },
          {
            scale: 1,
            opacity: 1,
            ease: 'power3.out',
            scrollTrigger: {
              trigger: stage,
              start: 'top bottom-=15%',
              end: 'center center',
              scrub: 0.6,
            },
          }
        )

        gsap.to(figure, {
          opacity: 0.2,
          scale: 0.95,
          ease: 'power2.in',
          scrollTrigger: {
            trigger: stage,
            start: 'center center-=10%',
            end: 'bottom top+=20%',
            scrub: 0.6,
          },
        })
      })
    },
    { scope: root }
  )

  return (
    <section ref={root} className={cn('mx-auto w-full max-w-[84rem] px-4 sm:px-6', className)}>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
        <div data-pin className="h-max lg:pt-8">
          <h2 className="display-lg">
            One paragraph,
            <br />
            four fixed stages.
          </h2>
          <p className="mt-5 max-w-[38ch] text-md leading-relaxed text-[var(--muted-foreground)]">
            Nothing happens off screen. Each stage leaves something you can open, read, and undo.
          </p>
          <ol className="mt-8 space-y-0 border-t border-[var(--rule)]">
            {STAGES.map((stage, index) => (
              <li
                key={stage.id}
                className="tabular flex items-baseline gap-3 border-b border-[var(--rule)] py-2 font-mono text-xs text-[var(--muted-foreground)]"
              >
                <span className="w-4 text-[var(--rule-strong)]">{index + 1}</span>
                <span className="text-[var(--foreground)]">{stage.title}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="space-y-24 lg:space-y-40">
          {STAGES.map((stage) => (
            <article key={stage.id} data-stage className="min-w-0">
              <figure data-figure className="will-change-[transform,opacity]">
                <div className="relative overflow-hidden rounded-xl border border-[var(--rule-strong)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={stage.image}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="aspect-[16/10] w-full object-cover grayscale contrast-125 brightness-[0.82] dark:brightness-[0.55]"
                  />
                  {/* A wash in the ground colour, so the photograph reads as a
                      surface of this page rather than as an inserted picture. */}
                  <div
                    aria-hidden
                    className="absolute inset-0 mix-blend-luminosity"
                    style={{
                      background:
                        'linear-gradient(200deg, color-mix(in oklab, var(--background) 15%, transparent), color-mix(in oklab, var(--background) 82%, transparent))',
                    }}
                  />
                  <span className="absolute left-3 top-3 rounded-[4px] border border-[var(--rule-strong)] bg-[var(--background)] px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-[var(--foreground)]">
                    {stage.title.toUpperCase()}
                  </span>
                </div>

                <figcaption className="mt-5">
                  <h3 className="display-md">{stage.title}</h3>
                  <p className="mt-2 max-w-[58ch] text-md leading-relaxed text-[var(--muted-foreground)]">
                    {stage.body}
                  </p>
                  <dl className="mt-5 grid max-w-lg grid-cols-2 border-t border-[var(--rule)]">
                    {stage.facts.map(([key, value]) => (
                      <div
                        key={key}
                        className="border-b border-[var(--rule)] py-2.5 pr-4 [&:nth-child(2)]:border-l [&:nth-child(2)]:pl-4"
                      >
                        <dt className="key">{key}</dt>
                        <dd className="mt-1 text-sm text-[var(--foreground)]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </figcaption>
              </figure>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
