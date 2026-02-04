'use client';

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import MetadataDashboard from "@/components/metadata-dashboard";
import { Button } from "@/components/ui/button";
import { Globe, GitBranch, Activity, Settings2 } from "lucide-react";
import { extractNetlifySiteNameFromUrl } from "@/lib/deploy-shared";

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

  const deployedAt = useMemo(() => {
    if (!project?.deployedAt) return null;
    return new Date(project.deployedAt).toLocaleString();
  }, [project?.deployedAt]);

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
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
