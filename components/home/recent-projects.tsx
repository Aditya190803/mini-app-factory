'use client'

import Link from 'next/link'
import { useUser } from '@stackframe/stack'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Badge, Skeleton, StatusDot } from '@/components/kit'
import { resolveTarget } from '@/lib/targets'

const LIMIT = 6

/**
 * The work already in progress, directly under the composer.
 *
 * Most visits to the home page are not someone starting something new; they
 * are someone going back to what they were building last night. So this is the
 * body of the page rather than a narrow rail beside it, and the rows carry the
 * same columns as the full list: state, name, target, when it last moved.
 *
 * Signed out it says nothing about projects at all, because "no projects" is
 * not information to somebody who has no account.
 */
export function RecentProjects() {
  const user = useUser()
  const projects = useQuery(api.projects.getUserProjects, user ? {} : 'skip')

  if (!user) return null

  return (
    <section aria-labelledby="recent-heading" className="min-w-0">
      <div className="ticked flex items-baseline justify-between gap-3 pb-2">
        <h2 id="recent-heading" className="text-md font-medium">
          Your projects
        </h2>
        {projects && projects.length > 0 && (
          <Link
            href="/projects"
            className="tabular rounded text-xs text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {projects.length > LIMIT ? `All ${projects.length}` : 'See all'}
          </Link>
        )}
      </div>

      {projects === undefined ? (
        <div className="mt-3 divide-y divide-[var(--rule)] overflow-hidden rounded-lg border border-[var(--rule)]">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 bg-[var(--surface-1)] px-3 py-2.5">
              <Skeleton className="size-2 rounded-full" />
              <Skeleton className="h-3 w-48" />
              <div className="flex-1" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
          <span className="sr-only" role="status">
            Loading your projects
          </span>
        </div>
      ) : projects.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-[var(--rule-strong)] px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">
          Nothing here yet. The first thing you build shows up in this list.
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
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors duration-[var(--dur-1)] hover:bg-[var(--surface-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--ring)] sm:px-4"
                >
                  <StatusDot
                    tone={live ? 'live' : 'pending'}
                    label={live ? 'Deployed' : 'Not deployed'}
                  />
                  <span className="min-w-0 truncate font-mono text-sm tracking-[-0.02em]">
                    {project.projectName}
                  </span>
                  <Badge tone={target === 'edge' ? 'signal' : 'neutral'} mono>
                    {target}
                  </Badge>

                  <span className="flex-1" />

                  <span className="hidden min-w-0 max-w-64 truncate font-mono text-xs text-[var(--muted-foreground)] md:block">
                    {project.deploymentUrl?.replace(/^https?:\/\//, '') ?? ''}
                  </span>
                  <span className="tabular shrink-0 text-xs text-[var(--muted-foreground)]">
                    <time dateTime={new Date(updatedAt).toISOString()}>
                      {new Date(updatedAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
