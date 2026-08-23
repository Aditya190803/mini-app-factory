'use client';

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import MetadataDashboard from "@/components/metadata-dashboard";
import { Button } from "@/components/ui/button";
import { Globe, GitBranch, Activity, Settings2, Brain } from "lucide-react";
import { extractNetlifySiteNameFromUrl } from "@/lib/deploy-shared";
import CloudflareProjectSettings from "@/components/cloudflare-project-settings";
import { inspectProject } from '@/lib/project-inspector';
import ProjectCollaboration from '@/components/project-collaboration';
import GitHubProjectSync from '@/components/github-project-sync';

interface ProjectSettingsProps {
  projectName: string;
}

export default function ProjectSettings({ projectName }: ProjectSettingsProps) {
  const project = useQuery(api.projects.getProject, { projectName });
  const files = useQuery(api.files.getFilesByProject, project?._id ? { projectId: project._id } : "skip");
  const deploymentHistory = useQuery(
    api.deployments.getDeploymentHistory,
    project?._id ? { projectId: project._id } : "skip"
  );
  const updateInstructions = useMutation(api.projects.updateProjectInstructions);
  const [instructions, setInstructions] = useState('');
  const [savingInstructions, setSavingInstructions] = useState(false);

  useEffect(() => {
    if (project) setInstructions(project.projectInstructions || '');
  }, [project]);

  const deployedAt = useMemo(() => {
    if (!project?.deployedAt) return null;
    return new Date(project.deployedAt).toLocaleString();
  }, [project?.deployedAt]);
  const architecture = useMemo(() => inspectProject(files || [], projectName), [files, projectName]);

  if (!project) {
    return (
      <div className="min-h-dvh flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-6xl mx-auto px-6 py-10 space-y-10">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Project Settings</div>
            <h1 className="text-lg font-display font-black uppercase tracking-[0.3em]" style={{ color: 'var(--foreground)' }}>
              {project.projectName}
            </h1>
          </div>
          <Button
            variant="outline"
            onClick={() => window.location.href = `/edit/${project.projectName}`}
            className="text-[10px] font-mono uppercase border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            Back to Editor
          </Button>
        </div>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <div className="flex items-center gap-2 text-[var(--secondary-text)]">
            <Activity className="w-4 h-4" />
            <h2 className="text-xs font-mono uppercase tracking-widest">Deployment</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4 text-[11px] font-mono text-[var(--muted-text)]">
            <div className="space-y-1">
              <div className="text-[9px] uppercase text-[var(--secondary-text)]">Provider</div>
              <div>{project.deployProvider ? project.deployProvider.toUpperCase() : project.isPublished ? 'HOSTED' : 'NOT DEPLOYED'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[9px] uppercase text-[var(--secondary-text)]">Last Deploy</div>
              <div>{deployedAt || '—'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[9px] uppercase text-[var(--secondary-text)]">Live URL</div>
              <div className="break-all">{project.deploymentUrl || (project.isPublished ? `${window.location.origin}/results/${project.projectName}` : '—')}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[9px] uppercase text-[var(--secondary-text)]">Repo</div>
              <div className="break-all">{project.repoUrl || '—'}</div>
            </div>
            <div className="space-y-1">
              <div className="text-[9px] uppercase text-[var(--secondary-text)]">Netlify Site</div>
              <div className="break-all">
                {project.netlifySiteName || extractNetlifySiteNameFromUrl(project.deploymentUrl) || '—'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {project.deploymentUrl && (
              <Button
                variant="outline"
                onClick={() => window.open(project.deploymentUrl!, '_blank')}
                className="text-[10px] font-mono uppercase border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <Globe className="w-3 h-3 mr-2" />
                Open Live
              </Button>
            )}
            {project.repoUrl && (
              <Button
                variant="outline"
                onClick={() => window.open(project.repoUrl!, '_blank')}
                className="text-[10px] font-mono uppercase border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                <GitBranch className="w-3 h-3 mr-2" />
                Open Repo
              </Button>
            )}
          </div>
          {deploymentHistory && deploymentHistory.length > 0 && (
            <div className="border-t border-[var(--border)] pt-4 mt-4 space-y-2">
              <div className="text-[10px] font-mono uppercase text-[var(--secondary-text)]">
                Deployment History
              </div>
              <div className="grid gap-2 text-[10px] font-mono text-[var(--muted-text)]">
                {deploymentHistory.slice(0, 5).map((entry) => (
                  <div key={entry._id} className="flex items-center justify-between">
                    <div>
                      {entry.provider.toUpperCase()} · {new Date(entry.createdAt).toLocaleString()}
                    </div>
                    <div className="text-[9px] text-[var(--secondary-text)] truncate max-w-[220px]">
                      {entry.deploymentUrl || entry.repoUrl || entry.netlifySiteName || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

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

        <section className="space-y-4 border border-[var(--border)] bg-[var(--background-surface)] p-6">
          <div className="flex items-center gap-2 text-[var(--secondary-text)]">
            <Brain className="size-4" />
            <h2 className="text-xs font-mono uppercase tracking-widest">Project memory</h2>
          </div>
          <p className="max-w-2xl text-xs leading-5 text-[var(--muted-text)]">Persistent product requirements, brand rules, technical constraints, and components that must not change. Build and Discuss follow these instructions on every request.</p>
          <textarea value={instructions} onChange={(event) => setInstructions(event.target.value)} maxLength={20_000} placeholder="Example: Use warm neutral colors. Keep authentication on Stack Auth. Never remove the audit log. Prefer accessible native controls." className="min-h-36 w-full resize-y rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm leading-6 text-[var(--foreground)] outline-none focus:border-[var(--primary)]" />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[var(--muted-text)]">{instructions.length.toLocaleString()} / 20,000</span>
            <Button type="button" disabled={savingInstructions} onClick={async () => { setSavingInstructions(true); try { await updateInstructions({ projectName, instructions }); } finally { setSavingInstructions(false); } }} className="text-xs">{savingInstructions ? 'Saving…' : 'Save memory'}</Button>
          </div>
        </section>

        <section className="space-y-5 border border-[var(--border)] bg-[var(--background-surface)] p-6">
          <div className="flex items-center gap-2 text-[var(--secondary-text)]"><Activity className="size-4" /><h2 className="text-xs font-mono uppercase tracking-widest">Architecture inspector</h2></div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div><h3 className="mb-2 text-xs font-medium">Worker API routes</h3>{architecture.routes.length ? <div className="space-y-1">{architecture.routes.map((route, index) => <div key={`${route.method}:${route.path}:${index}`} className="flex items-center gap-2 rounded-md bg-[var(--background)] px-3 py-2 text-xs"><span className="w-12 font-mono text-[var(--primary)]">{route.method}</span><span className="min-w-0 flex-1 truncate font-mono">{route.path}</span><span className="truncate text-[10px] text-[var(--muted-text)]">{route.source}</span></div>)}</div> : <p className="text-xs text-[var(--muted-text)]">No explicit Worker routes detected.</p>}</div>
            <div><h3 className="mb-2 text-xs font-medium">Cloudflare resources</h3>{architecture.resources.length ? <div className="flex flex-wrap gap-2">{architecture.resources.map((resource) => <span key={`${resource.kind}:${resource.binding}`} className="rounded-md border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-mono"><strong>{resource.binding}</strong> · {resource.kind} · {resource.name}</span>)}</div> : <p className="text-xs text-[var(--muted-text)]">No bound backend resources.</p>}</div>
            <div><h3 className="mb-2 text-xs font-medium">Schedules and queues</h3><div className="space-y-1 text-xs text-[var(--muted-text)]">{architecture.schedules.map((item) => <p key={`${item.worker}:${item.cron}`}>{item.worker}: cron {item.cron}</p>)}{architecture.queues.map((item) => <p key={`${item.worker}:${item.queue}`}>{item.worker}: queue {item.queue}</p>)}{!architecture.schedules.length && !architecture.queues.length ? <p>No background workflows.</p> : null}</div></div>
            <div><h3 className="mb-2 text-xs font-medium">Required environment</h3>{architecture.environmentNames.length ? <div className="flex flex-wrap gap-2">{architecture.environmentNames.map((name) => <code key={name} className="rounded-md bg-[var(--background)] px-2 py-1 text-[10px]">{name}</code>)}</div> : <p className="text-xs text-[var(--muted-text)]">No variables declared in .dev.vars.example.</p>}</div>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <div className="flex items-center gap-2 text-[var(--secondary-text)]">
            <Settings2 className="w-4 h-4" />
            <h2 className="text-xs font-mono uppercase tracking-widest">SEO & Metadata</h2>
          </div>
          <MetadataDashboard projectId={project._id} projectName={project.projectName} files={files || []} />
        </section>
      </div>
    </div>
  );
}
