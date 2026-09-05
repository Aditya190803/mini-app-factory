'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useUser } from '@stackframe/stack'
import { useMutation, useQuery } from 'convex/react'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  Cloud,
  Copy,
  ExternalLink,
  GitBranch,
  MoreHorizontal,
  Plus,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react'
import { api } from '@/convex/_generated/api'
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Modal,
  ModalContent,
  Row,
  RowList,
  Segmented,
  Skeleton,
  StatusDot,
} from '@/components/kit'
import { TopBar } from '@/components/shell/top-bar'
import { ThemeToggle } from '@/components/shell/theme-toggle'
import { AccountMenu } from '@/components/shell/account-menu'
import { useConfirm } from '@/hooks/use-confirm'
import { TARGETS, type BuildTarget } from '@/lib/targets'

type Project = NonNullable<ReturnType<typeof useProjects>>[number]

function useProjects() {
  return useQuery(api.projects.getUserProjects, {})
}

type StatusFilter = 'all' | 'live' | 'draft'
type TargetFilter = 'all' | BuildTarget

/**
 * The project list.
 *
 * A ruled list rather than a card grid. These rows are scanned, sorted, and
 * compared, and a grid of equal cards makes every one of those harder. The
 * columns that matter are fixed: state, name, target, where it is deployed,
 * when it last changed.
 */
export default function DashboardPage() {
  const user = useUser()
  const router = useRouter()
  const { confirm, confirmDialog } = useConfirm()

  const projects = useProjects()
  const deleteProject = useMutation(api.projects.deleteProject)
  const remixProject = useMutation(api.projects.remixPublishedProject)

  const [query, setQuery] = React.useState('')
  const [status, setStatus] = React.useState<StatusFilter>('all')
  const [target, setTarget] = React.useState<TargetFilter>('all')
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [remixSource, setRemixSource] = React.useState<Project | null>(null)
  const [remixName, setRemixName] = React.useState('')
  const [remixing, setRemixing] = React.useState(false)

  const filtered = React.useMemo(() => {
    if (!projects) return []
    const needle = query.trim().toLowerCase()
    return projects.filter((project) => {
      const live = Boolean(project.deploymentUrl || project.isPublished)
      if (status === 'live' && !live) return false
      if (status === 'draft' && live) return false
      // Rows written before targets existed have none. Treat those as static
      // rather than hiding them from both filters.
      if (target !== 'all' && (project.target ?? 'static') !== target) return false
      if (!needle) return true
      return (
        project.projectName.toLowerCase().includes(needle) ||
        (project.deploymentUrl ?? '').toLowerCase().includes(needle)
      )
    })
  }, [projects, query, status, target])

  const liveCount = projects?.filter((p) => p.deploymentUrl || p.isPublished).length ?? 0
  const filtersActive = query.trim() !== '' || status !== 'all' || target !== 'all'

  const handleDelete = async (project: Project) => {
    const ok = await confirm({
      title: `Delete ${project.projectName}?`,
      description:
        'The project and its files are removed. Anything already deployed to Cloudflare stays online until you take it down there.',
      confirmLabel: 'Delete project',
      destructive: true,
    })
    if (!ok) return

    setDeleting(project.projectName)
    try {
      await deleteProject({ projectName: project.projectName })
      toast.success('Project deleted', { description: project.projectName })
    } catch (error) {
      toast.error('Could not delete the project', {
        description: error instanceof Error ? error.message : 'Try again in a moment.',
      })
    } finally {
      setDeleting(null)
    }
  }

  const handleRemix = async () => {
    if (!remixSource || !remixName.trim()) return
    setRemixing(true)
    try {
      const result = await remixProject({
        sourceProjectName: remixSource.projectName,
        projectName: remixName,
      })
      toast.success('Remix created', {
        description: `${result.fileCount} files copied. No deployment credentials were carried over.`,
      })
      router.push(`/edit/${result.projectName}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remix the project')
    } finally {
      setRemixing(false)
    }
  }

  const chrome = (
    <>
      <ThemeToggle className="mr-1 hidden sm:inline-flex" />
      <AccountMenu />
    </>
  )

  if (projects === undefined) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar crumbs={[{ label: 'Projects' }]}>{chrome}</TopBar>
        <main className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-8 sm:px-6">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
          <div className="mt-8 divide-y divide-[var(--rule)] overflow-hidden rounded-lg border border-[var(--rule)]">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="size-2 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
        </main>
        <span role="status" className="sr-only">
          Loading your projects
        </span>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <TopBar crumbs={[{ label: 'Projects' }]}>{chrome}</TopBar>
        <main className="mx-auto flex w-full max-w-md flex-1 items-center px-6">
          <EmptyState title="Sign in to see your projects" className="w-full">
            <p>Projects are tied to your account, so there is nothing to show until you sign in.</p>
            <div className="mt-5 flex justify-center gap-2">
              <Button intent="primary" onClick={() => router.push('/handler/sign-in')}>
                Sign in
              </Button>
              <Button asChild>
                <Link href="/">Back to the composer</Link>
              </Button>
            </div>
          </EmptyState>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar crumbs={[{ label: 'Projects' }]}>{chrome}</TopBar>

      <main id="main" className="mx-auto w-full max-w-[84rem] flex-1 px-4 py-8 sm:px-6">
        <div className="ticked flex flex-wrap items-end justify-between gap-4 pb-3">
          <div>
            <h1 className="text-2xl font-medium tracking-[-0.024em]">Projects</h1>
            <p className="tabular mt-1 text-sm text-[var(--muted-foreground)]">
              {projects.length === 0
                ? 'Nothing here yet.'
                : `${projects.length} project${projects.length === 1 ? '' : 's'}${
                    liveCount > 0 ? `, ${liveCount} deployed` : ''
                  }`}
            </p>
          </div>
          <Button intent="primary" asChild>
            <Link href="/">
              <Plus className="size-4" />
              New project
            </Link>
          </Button>
        </div>

        {projects.length > 0 && (
          <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--muted-foreground)]"
              />
              <label htmlFor="project-search" className="sr-only">
                Search projects by name or URL
              </label>
              <Input
                id="project-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name or URL"
                autoComplete="off"
                className="pl-8"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Filter by deployment state"
                value={status}
                onChange={setStatus}
                size="sm"
                options={[
                  { value: 'all', label: 'All' },
                  { value: 'live', label: 'Deployed' },
                  { value: 'draft', label: 'Draft' },
                ]}
              />
              <Segmented
                label="Filter by build target"
                value={target}
                onChange={setTarget}
                size="sm"
                options={[
                  { value: 'all', label: 'Any' },
                  { value: 'static', label: 'Static' },
                  { value: 'edge', label: 'Edge' },
                ]}
              />
            </div>
          </div>
        )}

        <div className="mt-5">
          {projects.length === 0 ? (
            <EmptyState
              title="Build the first one"
              icon={<Cloud className="size-5" />}
              action={
                <Button intent="primary" asChild>
                  <Link href="/">
                    Start a project
                    <ArrowUpRight className="size-4" />
                  </Link>
                </Button>
              }
            >
              <p>
                Describe an app in a sentence. You get the files, a preview you can click through,
                and a deploy to your own Cloudflare account when you are ready.
              </p>
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState title="Nothing matches those filters">
              <p>
                {query.trim() ? `No project matches "${query.trim()}"` : 'No project matches'}
                {status !== 'all' ? ` in ${status}` : ''}
                {target !== 'all' ? ` on ${TARGETS[target].label.toLowerCase()}` : ''}.
              </p>
              <div className="mt-4 flex justify-center">
                <Button
                  size="sm"
                  onClick={() => {
                    setQuery('')
                    setStatus('all')
                    setTarget('all')
                  }}
                >
                  Clear filters
                </Button>
              </div>
            </EmptyState>
          ) : (
            <>
              <RowList>
                {filtered.map((project) => (
                  <ProjectRow
                    key={project._id}
                    project={project}
                    deleting={deleting === project.projectName}
                    onDelete={() => void handleDelete(project)}
                    onRemix={() => {
                      setRemixSource(project)
                      setRemixName(`${project.projectName}-copy`)
                    }}
                  />
                ))}
              </RowList>
              {filtersActive && (
                <p className="tabular mt-2.5 text-xs text-[var(--muted-foreground)]">
                  Showing {filtered.length} of {projects.length}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {confirmDialog}

      <Modal open={remixSource !== null} onOpenChange={(open) => !open && setRemixSource(null)}>
        <ModalContent
          size="sm"
          title={`Remix ${remixSource?.projectName ?? ''}`}
          description="Creates an independent private copy of the files. Cloudflare resources, custom domains, secrets, and deployment links are never carried over."
          footer={
            <>
              <Button onClick={() => setRemixSource(null)}>Cancel</Button>
              <Button
                intent="primary"
                busy={remixing}
                disabled={!remixName.trim()}
                onClick={() => void handleRemix()}
              >
                <Copy className="size-4" />
                Create remix
              </Button>
            </>
          }
        >
          <Field
            label="Name for the copy"
            hint="Lowercase letters, numbers, and dashes."
          >
            <Input
              value={remixName}
              maxLength={63}
              onChange={(event) =>
                setRemixName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
              }
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleRemix()
              }}
            />
          </Field>
        </ModalContent>
      </Modal>
    </div>
  )
}

function ProjectRow({
  project,
  deleting,
  onDelete,
  onRemix,
}: {
  project: Project
  deleting: boolean
  onDelete: () => void
  onRemix: () => void
}) {
  const live = Boolean(project.deploymentUrl || project.isPublished)
  const target: BuildTarget = project.target === 'edge' ? 'edge' : 'static'
  const provider = project.deployProvider ?? (project.isPublished ? 'factory' : null)
  const updatedAt = project.updatedAt ?? project.createdAt
  const pages = project.pageCount || 1

  return (
    <Row>
      <StatusDot
        tone={live ? 'live' : 'pending'}
        label={live ? 'Deployed' : 'Not deployed'}
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/edit/${project.projectName}`}
            className="truncate rounded font-mono text-sm font-medium tracking-[-0.02em] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
          >
            {project.projectName}
          </Link>
          <Badge tone={target === 'edge' ? 'signal' : 'neutral'} mono>
            {target}
          </Badge>
          {project.accessRole !== 'owner' && <Badge tone="info">{project.accessRole}</Badge>}
        </div>

        <p className="tabular mt-1 truncate text-xs text-[var(--muted-foreground)]">
          {provider ? (
            <span className="text-[var(--foreground)]">{provider}</span>
          ) : (
            'Not deployed'
          )}
          {' · '}
          {pages} page{pages === 1 ? '' : 's'}
          {' · '}
          <time dateTime={new Date(updatedAt).toISOString()}>
            {new Date(updatedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })}
          </time>
          {project.deploymentUrl ? ` · ${project.deploymentUrl.replace(/^https?:\/\//, '')}` : ''}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" asChild>
          <Link href={`/edit/${project.projectName}`}>Open</Link>
        </Button>

        {live && project.deploymentUrl && (
          <IconButton label={`Visit ${project.projectName}`} size="sm" asChild>
            <a href={project.deploymentUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-3.5" />
            </a>
          </IconButton>
        )}

        <Menu>
          <MenuTrigger asChild>
            <IconButton label={`More actions for ${project.projectName}`} size="sm">
              <MoreHorizontal className="size-4" />
            </IconButton>
          </MenuTrigger>
          <MenuContent>
            <MenuItem asChild>
              <Link href={`/edit/${project.projectName}/settings`}>
                <Settings2 />
                Project settings
              </Link>
            </MenuItem>
            {project.repoUrl && (
              <MenuItem asChild>
                <a href={project.repoUrl} target="_blank" rel="noopener noreferrer">
                  <GitBranch />
                  Open repo
                </a>
              </MenuItem>
            )}
            {project.isPublished && (
              <MenuItem onSelect={onRemix}>
                <Copy />
                Remix a copy
              </MenuItem>
            )}
            {project.accessRole === 'owner' && (
              <>
                <MenuSeparator />
                <MenuItem danger disabled={deleting} onSelect={onDelete}>
                  <Trash2 />
                  {deleting ? 'Deleting' : 'Delete project'}
                </MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>
    </Row>
  )
}
