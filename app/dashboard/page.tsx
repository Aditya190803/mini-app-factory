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
  Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FactoryIcon } from "@/components/ui/factory-icon";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import AccountMenu from "@/components/account-menu";
import { ThemeSwitcher } from "@/components/theme-switcher";
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

  const filteredProjects = useMemo(() => {
    if (!projects) return [];
    const query = searchQuery.trim().toLowerCase();
    if (!query) return projects;
    return projects.filter(
      (project) =>
        project.projectName.toLowerCase().includes(query) ||
        (project.deploymentUrl ?? '').toLowerCase().includes(query),
    );
  }, [projects, searchQuery]);

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
      <div className="min-h-dvh bg-background">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="mb-8 space-y-2">
            <div className="h-8 w-40 animate-pulse rounded-md bg-muted" />
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
          </div>
          {/* Skeletons mirror the card layout so nothing jumps on load. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="space-y-4 rounded-xl border border-border p-5"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-16 animate-pulse rounded-lg bg-muted" />
                <div className="h-9 animate-pulse rounded-lg bg-muted" />
              </div>
            ))}
          </div>
        </div>
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
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2.5 rounded-md">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <FactoryIcon size={18} />
            </span>
            <span className="text-[15px] font-semibold tracking-tight">Projects</span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeSwitcher className="mx-1" />
            <AccountMenu />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Your projects</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {projects.length === 0
                ? 'Nothing here yet.'
                : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button onClick={() => router.push('/')}>
            <Plus className="size-4" />
            New project
          </Button>
        </div>

        {/* Search only earns its place once the list is long enough to scan. */}
        {projects.length > 6 && (
          <div className="mb-6 max-w-sm">
            <label htmlFor="project-search" className="sr-only">Search projects</label>
            <Input
              id="project-search"
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search projects…"
              autoComplete="off"
            />
          </div>
        )}

        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-6 py-20 text-center">
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
          <p className="rounded-xl border border-dashed border-border px-6 py-16 text-center text-sm text-muted-foreground">
            No projects match “{searchQuery}”.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjects.map((project) => {
              const deployLabel = project.deploymentUrl
                ? (project.deployProvider ?? 'Deployed')
                : project.isPublished
                  ? 'Hosted'
                  : 'Not deployed';

              return (
                <article
                  key={project._id}
                  className="group flex flex-col rounded-xl border border-border bg-card transition-colors hover:border-foreground/20"
                >
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h2 className="min-w-0 font-mono text-sm font-medium">
                        <Link
                          href={`/edit/${project.projectName}`}
                          className="block truncate rounded outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          {project.projectName}
                        </Link>
                      </h2>
                      {project.accessRole !== 'owner' && (
                        <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                          {project.accessRole}
                        </span>
                      )}
                    </div>

                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground">Pages</dt>
                        <dd className="tabular mt-0.5">{project.pageCount || 1}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">Created</dt>
                        <dd className="tabular mt-0.5">
                          <time dateTime={new Date(project.createdAt).toISOString()}>
                            {new Date(project.createdAt).toLocaleDateString(undefined, {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                            })}
                          </time>
                        </dd>
                      </div>
                      <div className="col-span-2">
                        <dt className="text-xs text-muted-foreground">Deployment</dt>
                        <dd className="mt-1 flex items-center gap-1.5">
                          {/* Shape as well as colour, so status doesn't rely on hue alone. */}
                          <span
                            aria-hidden
                            className={cn(
                              'size-1.5 rounded-full',
                              project.deploymentUrl || project.isPublished
                                ? 'bg-success'
                                : 'bg-muted-foreground/40',
                            )}
                          />
                          <span className="capitalize">{deployLabel}</span>
                        </dd>
                        {project.deploymentUrl && (
                          <dd className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {project.deploymentUrl}
                          </dd>
                        )}
                      </div>
                    </dl>

                    {/* Buttons pinned to the bottom so they line up across cards. */}
                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-5">
                      <Button size="sm" onClick={() => router.push(`/edit/${project.projectName}`)}>
                        Open
                      </Button>
                      {(project.deploymentUrl || project.isPublished) && (
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
                    </div>
                  </div>

                  {/* Secondary actions. Always in the tree — never hover-only,
                      which is unreachable by keyboard and touch. */}
                  <div className="flex items-center gap-1 border-t border-border px-3 py-2">
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
                        className="ml-auto text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        {isDeleting === project.projectName ? (
                          <Spinner className="size-3.5" />
                        ) : (
                          <Trash2 className="size-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
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
