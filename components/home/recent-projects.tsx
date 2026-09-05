'use client'

import Link from 'next/link'
import { useUser } from '@stackframe/stack'
import { useQuery } from 'convex/react'
import { ArrowRight } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import { Badge, Skeleton, StatusDot } from '@/components/kit'
import { resolveTarget } from '@/lib/targets'

const LIMIT = 6

/**
 * The rail beside the composer.
 *
 * The home page is where a returning user starts, and most of the time they
 * are not starting something new: they are going back to the thing they were
 * working on last night. Putting the six most recent projects one click away
 * is the difference between this page being a workspace and being a form.
 *
 * Signed out, the same space explains what happens instead of showing an empty
 * list, because "no projects" is not useful to somebody who has no account.
 */
export function RecentProjects() {
  const user = useUser()
  const projects = useQuery(api.projects.getUserProjects, user ? {} : 'skip')

  if (!user) {
    return (
      <section aria-labelledby="recent-heading" className="min-w-0">
        <h2 id="recent-heading" className="key">
          Your projects
        </h2>
        <div className="mt-3 rounded-lg border border-[var(--rule)] bg-[var(--surface-1)] p-4">
          <p className="text-sm leading-relaxed text-[var(--muted-foreground)]">
            Describe something below to see what it produces. Signing in is what keeps it, and you
            are asked only when the first build starts.
          </p>
          <Link
            href="/about"
            className="mt-3 inline-flex items-center gap-1.5 rounded text-sm text-[var(--signal-text)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            What this does
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="recent-heading" className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-heading" className="key">
          Recent
        </h2>
        {projects && projects.length > LIMIT && (
          <Link
            href="/dashboard"
            className="rounded text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            All {projects.length}
          </Link>
        )}
      </div>

      {projects === undefined ? (
        <div className="mt-3 space-y-px overflow-hidden rounded-lg border border-[var(--rule)]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-2.5 bg-[var(--surface-1)] px-3 py-2.5">
              <Skeleton className="size-2 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          ))}
          <span className="sr-only" role="status">
            Loading your projects
          </span>
        </div>
      ) : projects.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--rule-strong)] px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
          Nothing yet. The first thing you build shows up here.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--rule)] overflow-hidden rounded-lg border border-[var(--rule)] bg-[var(--surface-1)]">
          {projects.slice(0, LIMIT).map((project) => {
            const live = Boolean(project.deploymentUrl || project.isPublished)
            const target = resolveTarget(project.target, [])
            const updatedAt = project.updatedAt ?? project.createdAt

            return (
              <li key={project._id}>
                <Link
                  href={`/edit/${project.projectName}`}
                  className="flex items-center gap-2.5 px-3 py-2.5 transition-colors duration-[var(--dur-1)] hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  <StatusDot
                    tone={live ? 'live' : 'pending'}
                    label={live ? 'Deployed' : 'Not deployed'}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm tracking-[-0.02em]">
                      {project.projectName}
                    </span>
                    <span className="tabular block truncate text-xs text-[var(--muted-foreground)]">
                      <time dateTime={new Date(updatedAt).toISOString()}>
                        {new Date(updatedAt).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </span>
                  </span>
                  <Badge tone={target === 'edge' ? 'signal' : 'neutral'} mono>
                    {target}
                  </Badge>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
