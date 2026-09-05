'use client'

import * as React from 'react'
import Link from 'next/link'
import { useMutation, useQuery } from 'convex/react'
import { ExternalLink } from 'lucide-react'
import { api } from '@/convex/_generated/api'
import MetadataDashboard from '@/components/metadata-dashboard'
import CloudflareProjectSettings from '@/components/cloudflare-project-settings'
import ProjectCollaboration from '@/components/project-collaboration'
import GitHubProjectSync from '@/components/github-project-sync'
import { TopBar } from '@/components/shell/top-bar'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { AccountMenu } from '@/components/shell/account-menu'
import {
  Badge,
  Button,
  CopyValue,
  Field,
  Row,
  RowList,
  Section,
  Skeleton,
  SpecTable,
  Textarea,
} from '@/components/kit'
import { extractNetlifySiteNameFromUrl } from '@/lib/deploy-shared'
import { inspectProject } from '@/lib/project-inspector'
import { resolveTarget, TARGETS } from '@/lib/targets'

/**
 * Project settings.
 *
 * A single scrolling column of ruled sections rather than tabs. Everything
 * here is read occasionally and in no particular order, and tabs would hide
 * exactly the section someone came looking for.
 *
 * Ordered by how often it is needed: what is deployed, then Cloudflare, then
 * access, then the things you set once.
 */
export default function ProjectSettings({ projectName }: { projectName: string }) {
  const project = useQuery(api.projects.getProject, { projectName })
  const files = useQuery(
    api.files.getFilesByProject,
    project?._id ? { projectId: project._id } : 'skip'
  )
  const deploymentHistory = useQuery(
    api.deployments.getDeploymentHistory,
    project?._id ? { projectId: project._id } : 'skip'
  )
  const updateInstructions = useMutation(api.projects.updateProjectInstructions)

  const [instructions, setInstructions] = React.useState('')
  const [savingInstructions, setSavingInstructions] = React.useState(false)

  React.useEffect(() => {
    if (project) setInstructions(project.projectInstructions || '')
  }, [project])

  const projectFiles = React.useMemo(
    () =>
      (files || []).map((file) => ({
        path: file.path,
        fileType: file.fileType,
      })),
    [files]
  )

  const architecture = React.useMemo(
    () => inspectProject(files || [], projectName),
    [files, projectName]
  )

  const chrome = (
    <>
      <ThemeToggle className="mr-1 hidden sm:inline-flex" />
      <AccountMenu />
    </>
  )

  if (!project) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar crumbs={[{ label: 'Projects', href: '/dashboard' }, { label: projectName }]}>
          {chrome}
        </TopBar>
        <main className="mx-auto w-full max-w-4xl flex-1 space-y-6 px-4 py-10 sm:px-6">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </main>
      </div>
    )
  }

  const target = resolveTarget(project.target, projectFiles)
  const liveUrl =
    project.deploymentUrl ||
    (project.isPublished ? `/results/${project.projectName}` : undefined)

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        crumbs={[
          { label: 'Projects', href: '/dashboard' },
          { label: project.projectName, href: `/edit/${project.projectName}` },
          { label: 'Settings' },
        ]}
      >
        {chrome}
      </TopBar>

      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6">
        <div className="ticked flex flex-wrap items-end justify-between gap-4 pb-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate font-mono text-2xl tracking-[-0.04em]">
                {project.projectName}
              </h1>
              <Badge tone={target === 'edge' ? 'signal' : 'neutral'} mono>
                {target}
              </Badge>
            </div>
            <p className="mt-1.5 max-w-[64ch] text-sm text-[var(--muted-foreground)]">
              {TARGETS[target].summary}
            </p>
          </div>
          <Button asChild>
            <Link href={`/edit/${project.projectName}`}>Back to the editor</Link>
          </Button>
        </div>

        <div className="mt-10 space-y-12">
          <Section
            title="Deployment"
            description="Where this project currently is, and how it got there."
            actions={
              liveUrl && (
                <Button size="sm" asChild>
                  <a href={liveUrl} target="_blank" rel="noopener noreferrer">
                    Open
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              )
            }
          >
            <SpecTable
              caption="Deployment"
              rows={[
                {
                  key: 'provider',
                  label: 'Provider',
                  value: project.deployProvider ?? (project.isPublished ? 'factory' : 'Not deployed'),
                  muted: !project.deployProvider && !project.isPublished,
                },
                {
                  key: 'when',
                  label: 'Last deploy',
                  value: project.deployedAt
                    ? new Date(project.deployedAt).toLocaleString()
                    : 'Never',
                  muted: !project.deployedAt,
                  mono: Boolean(project.deployedAt),
                },
                {
                  key: 'url',
                  label: 'Live URL',
                  value: liveUrl ? <CopyValue value={liveUrl} label="the live URL" /> : 'None yet',
                  muted: !liveUrl,
                },
                {
                  key: 'repo',
                  label: 'Repository',
                  value: project.repoUrl ? (
                    <CopyValue value={project.repoUrl} label="the repo URL" />
                  ) : (
                    'Not linked'
                  ),
                  muted: !project.repoUrl,
                },
                {
                  key: 'netlify',
                  label: 'Netlify site',
                  value:
                    project.netlifySiteName ||
                    extractNetlifySiteNameFromUrl(project.deploymentUrl) ||
                    'Not used',
                  muted: !project.netlifySiteName,
                  mono: Boolean(project.netlifySiteName),
                },
              ]}
            />

            {deploymentHistory && deploymentHistory.length > 0 && (
              <div className="mt-5">
                <p className="key mb-2">Recent deploys</p>
                <RowList>
                  {deploymentHistory.slice(0, 5).map((entry) => (
                    <Row key={entry._id}>
                      <Badge tone="neutral" mono>
                        {entry.provider}
                      </Badge>
                      <span className="tabular min-w-0 flex-1 truncate text-xs text-[var(--muted-foreground)]">
                        <time dateTime={new Date(entry.createdAt).toISOString()}>
                          {new Date(entry.createdAt).toLocaleString()}
                        </time>
                      </span>
                      <span className="hidden min-w-0 max-w-64 shrink truncate font-mono text-xs text-[var(--muted-foreground)] sm:block">
                        {entry.deploymentUrl || entry.repoUrl || entry.netlifySiteName || ''}
                      </span>
                    </Row>
                  ))}
                </RowList>
              </div>
            )}
          </Section>

          <CloudflareProjectSettings
            projectName={project.projectName}
            cloudflareProjectName={project.cloudflareProjectName}
            d1DatabaseName={project.cloudflareD1DatabaseName}
            resourcesJson={project.cloudflareResourcesJson}
            customDomain={project.cloudflareCustomDomain}
            deployments={deploymentHistory || []}
          />

          <ProjectCollaboration projectId={project._id} />

          <GitHubProjectSync projectName={project.projectName} repoUrl={project.repoUrl} />

          <Section
            title="Architecture"
            description="Read straight from the files, so it is always what the project currently contains rather than what it was generated as."
          >
            <div className="grid gap-6 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="key">Worker routes</p>
                {architecture.routes.length ? (
                  <ul className="mt-2 space-y-1">
                    {architecture.routes.map((route, index) => (
                      <li
                        key={`${route.method}:${route.path}:${index}`}
                        className="flex items-baseline gap-2 font-mono text-xs"
                      >
                        <span className="w-12 shrink-0 text-[var(--signal-text)]">
                          {route.method}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{route.path}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    No Worker routes. This is a static site.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <p className="key">Bound resources</p>
                {architecture.resources.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {architecture.resources.map((resource) => (
                      <li key={`${resource.kind}:${resource.binding}`}>
                        <Badge tone="neutral" mono>
                          {resource.binding} · {resource.kind} · {resource.name}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Nothing bound. No database, no storage.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <p className="key">Background work</p>
                {architecture.schedules.length || architecture.queues.length ? (
                  <ul className="mt-2 space-y-1 font-mono text-xs text-[var(--muted-foreground)]">
                    {architecture.schedules.map((item) => (
                      <li key={`${item.worker}:${item.cron}`}>
                        {item.worker} on cron {item.cron}
                      </li>
                    ))}
                    {architecture.queues.map((item) => (
                      <li key={`${item.worker}:${item.queue}`}>
                        {item.worker} consumes {item.queue}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    No crons and no queue consumers.
                  </p>
                )}
              </div>

              <div className="min-w-0">
                <p className="key">Expected environment</p>
                {architecture.environmentNames.length ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {architecture.environmentNames.map((name) => (
                      <li key={name}>
                        <Badge tone="neutral" mono>
                          {name}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                    Nothing declared in .dev.vars.example.
                  </p>
                )}
              </div>
            </div>
          </Section>

          <Section
            title="Project memory"
            description="Rules that every future request has to follow: product requirements, brand constraints, technical decisions, and anything that must not be changed. Both Build and Discuss read this."
            actions={
              <Button
                intent="primary"
                size="sm"
                busy={savingInstructions}
                onClick={async () => {
                  setSavingInstructions(true)
                  try {
                    await updateInstructions({ projectName, instructions })
                  } finally {
                    setSavingInstructions(false)
                  }
                }}
              >
                Save
              </Button>
            }
          >
            <Field
              label="Standing instructions"
              hideLabel
              hint={`${instructions.length.toLocaleString()} of 20,000 characters`}
            >
              <Textarea
                value={instructions}
                maxLength={20_000}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Keep authentication on Stack Auth. Never remove the audit log. Prefer native form controls over custom ones. Use warm neutrals, no purple."
                className="min-h-36"
              />
            </Field>
          </Section>

          <Section
            title="Metadata and SEO"
            description="Titles, descriptions, and social images, per page and for the site as a whole."
          >
            <MetadataDashboard
              projectId={project._id}
              projectName={project.projectName}
              files={files || []}
            />
          </Section>
        </div>
      </main>
    </div>
  )
}
