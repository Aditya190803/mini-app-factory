'use client';

import { useUser } from "@stackframe/stack";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Trash2,
  Settings2,
  Layers,
  Globe,
  ArrowRight,
  Rocket,
  Copy,
  Plus,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import AccountMenu from "@/components/account-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { SiteHeader } from '@/components/site-header';
import { WorkshopBackground } from '@/components/workshop-background';
import { useConfirm } from "@/hooks/use-confirm";

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const projects = useQuery(api.projects.getUserProjects, {});
  const deleteProject = useMutation(api.projects.deleteProject);
  const remixPublishedProject = useMutation(api.projects.remixPublishedProject);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [remixSource, setRemixSource] = useState<NonNullable<typeof projects>[number] | null>(null);
  const [remixName, setRemixName] = useState('');
  const [isRemixing, setIsRemixing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'live' | 'draft'>('all');

  const liveCount = useMemo(() => {
    if (!projects) return 0;
    return projects.filter((p) => p.deploymentUrl || p.isPublished).length;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const query = searchQuery.trim().toLowerCase();
    return projects.filter((project) => {
      const isLive = Boolean(project.deploymentUrl || project.isPublished);
      if (statusFilter === 'live' && !isLive) return false;
      if (statusFilter === 'draft' && isLive) return false;
      if (!query) return true;
      return (
        project.projectName.toLowerCase().includes(query) ||
        (project.deploymentUrl ?? '').toLowerCase().includes(query)
      );
    });
  }, [projects, searchQuery, statusFilter]);

  const handleDelete = async (projectName: string) => {
    if (!user) return;
    const ok = await confirm({
      title: `Delete ${projectName}?`,
      description:
        'This removes the project and its files. Deployments already live are not taken down.',
      confirmLabel: 'Delete project',
      destructive: true,
    });
    if (!ok) return;

    setIsDeleting(projectName);
    try {
      await deleteProject({ projectName });
      toast.success('Project deleted', { description: projectName });
    } catch (error) {
      console.error("Failed to delete project:", error);
      toast.error('Could not delete project', {
        description: error instanceof Error ? error.message : 'Try again in a moment.',
      });
    } finally {
      setIsDeleting(null);
    }
  };

  const openRemix = (project: NonNullable<typeof projects>[number]) => {
    setRemixSource(project);
    setRemixName(`${project.projectName}-copy`);
  };

  const handleRemix = async () => {
    if (!remixSource || !remixName.trim()) return;
    setIsRemixing(true);
    try {
      const result = await remixPublishedProject({ sourceProjectName: remixSource.projectName, projectName: remixName });
      toast.success('Remix created', { description: `${result.fileCount} files copied without deployment credentials.` });
      router.push(`/edit/${result.projectName}`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not remix project'); }
    finally { setIsRemixing(false); }
  };

  if (projects === undefined) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <SiteHeader title="Projects">
          <ThemeSwitcher className="mx-1" />
          <AccountMenu />
        </SiteHeader>
        <main className="relative mx-auto w-full max-w-6xl flex-1 px-6 py-10">
          <WorkshopBackground />
          <div className="relative mb-8 space-y-2">
            <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
          {/* Skeletons mirror the row layout so nothing jumps on load. */}
          <div className="relative divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                <div className="size-2 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
              </div>
            ))}
          </div>
        </main>
        <span className="sr-only" role="status">
          Loading your projects
        </span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-6">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to continue</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your projects are tied to your account.
          </p>
          <Button className="mt-5" onClick={() => router.push('/handler/sign-in')}>
            Sign in
          </Button>
          <div className="mt-3">
            <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader title="Projects">
        <ThemeSwitcher className="mx-1" />
        <AccountMenu />
      </SiteHeader>

      <main id="main" className="relative mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <WorkshopBackground />
        <div className="relative mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Workspace
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Projects</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {projects.length === 0
                ? 'Nothing here yet.'
                : `${projects.length} project${projects.length === 1 ? '' : 's'}${liveCount > 0 ? ` · ${liveCount} live` : ''}`}
            </p>
          </div>
          <Button onClick={() => router.push('/')}>
            <Plus className="size-4" />
            New project
          </Button>
        </div>

        {projects.length > 0 && (
          <div className="relative mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm flex-1">
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <label htmlFor="project-search" className="sr-only">Search projects</label>
              <Input
                id="project-search"
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search projects…"
                autoComplete="off"
                className="pl-9"
              />
            </div>
            <div role="group" aria-label="Filter by status" className="flex self-start rounded-lg border border-border bg-card p-0.5 text-sm sm:self-auto">
              {(['all', 'live', 'draft'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={statusFilter === f}
                  onClick={() => setStatusFilter(f)}
                  className={cn(
                    'rounded-md px-3 py-1.5 capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                    statusFilter === f
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <div className="relative rounded-xl border border-dashed border-border px-6 py-20 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Layers className="size-5" />
            </span>
            <h2 className="mt-5 text-lg font-semibold">Build your first app</h2>
            <p className="mx-auto mt-2 max-w-sm text-pretty text-sm text-muted-foreground">
              Describe what you want in plain language and you&apos;ll get the files, a
              preview, and a deploy you can inspect.
            </p>
            <Button className="mt-6" onClick={() => router.push('/')}>
              Start a project
              <ArrowRight className="size-4" />
            </Button>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="relative rounded-xl border border-dashed border-border px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">
              No projects match{searchQuery.trim() ? ` “${searchQuery.trim()}”` : ''}{statusFilter !== 'all' ? ` in ${statusFilter}s` : ''}.
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
              Clear search and filters
            </Button>
          </div>
        ) : (
          <ul className="relative divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {filteredProjects.map((project) => {
              const isLive = Boolean(project.deploymentUrl || project.isPublished);
              const deployLabel = project.deploymentUrl
                ? (project.deployProvider ?? 'Deployed')
                : project.isPublished
                  ? 'Hosted'
                  : 'Draft';
              const updatedAt = project.updatedAt ?? project.createdAt;

              return (
                <li
                  key={project._id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 sm:gap-4 sm:px-5"
                >
                  {/* Shape as well as colour, so status doesn't rely on hue alone. */}
                  <span
                    aria-hidden
                    title={deployLabel}
                    className={cn(
                      'size-2 shrink-0 rounded-full',
                      isLive ? 'bg-success' : 'border border-muted-foreground/50',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/edit/${project.projectName}`}
                        className="truncate rounded font-mono text-sm font-medium outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {project.projectName}
                      </Link>
                      {project.accessRole !== 'owner' && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                          {project.accessRole}
                        </span>
                      )}
                    </div>
                    <p className="tabular mt-1 truncate text-xs text-muted-foreground">
                      <span className={cn(isLive ? 'font-medium text-foreground' : undefined)}>{deployLabel}</span>
                      {' · '}{project.pageCount || 1} page{(project.pageCount || 1) === 1 ? '' : 's'}
                      {' · Updated '}
                      <time dateTime={new Date(updatedAt).toISOString()}>
                        {new Date(updatedAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                      {project.deploymentUrl ? ` · ${project.deploymentUrl}` : ''}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    <Button size="sm" onClick={() => router.push(`/edit/${project.projectName}`)}>
                      Open
                    </Button>
                    {isLive && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          window.open(
                            project.deploymentUrl || `/results/${project.projectName}`,
                            '_blank',
                            'noopener,noreferrer',
                          )
                        }
                      >
                        <Globe className="size-3.5" />
                        View
                      </Button>
                    )}
                    {project.repoUrl && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(project.repoUrl, '_blank', 'noopener,noreferrer')}
                      >
                        Repo
                      </Button>
                    )}
                    {/* Secondary actions. Always in the tree — never hover-only,
                        which is unreachable by keyboard and touch. */}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Project settings"
                      aria-label={`Settings for ${project.projectName}`}
                      onClick={() => router.push(`/edit/${project.projectName}/settings`)}
                    >
                      <Settings2 className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title="Deploy"
                      aria-label={`Deploy ${project.projectName}`}
                      onClick={() => router.push(`/edit/${project.projectName}`)}
                    >
                      <Rocket className="size-3.5" />
                    </Button>
                    {project.isPublished && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Remix project"
                        aria-label={`Remix ${project.projectName}`}
                        onClick={() => openRemix(project)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                    )}
                    {project.accessRole === 'owner' && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Delete project"
                        aria-label={`Delete ${project.projectName}`}
                        disabled={isDeleting === project.projectName}
                        onClick={() => handleDelete(project.projectName)}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        {isDeleting === project.projectName ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {confirmDialog}

      <Dialog open={remixSource !== null} onOpenChange={(open) => { if (!open) setRemixSource(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Remix {remixSource?.projectName}</DialogTitle><DialogDescription>Create an independent private copy. Cloudflare resources, domains, secrets, and deployment links are never copied.</DialogDescription></DialogHeader>
          <div className="space-y-2 py-3"><label htmlFor="remix-name" className="text-xs font-medium">New project name</label><Input id="remix-name" value={remixName} onChange={(event) => setRemixName(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} maxLength={63} onKeyDown={(event) => { if (event.key === 'Enter') void handleRemix(); }} /></div>
          <DialogFooter><Button variant="outline" onClick={() => setRemixSource(null)}>Cancel</Button><Button onClick={() => void handleRemix()} disabled={isRemixing || !remixName.trim()}>{isRemixing ? <Spinner className="mr-2 size-4" /> : <Copy className="mr-2 size-4" />}{isRemixing ? 'Remixing…' : 'Create remix'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
