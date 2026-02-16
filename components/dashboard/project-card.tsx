'use client';

import { useRouter } from 'next/navigation';
import {
  Trash2,
  Settings2,
  Calendar,
  Layers,
  Globe,
  Rocket,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface ProjectCardData {
  _id: string;
  projectName: string;
  prompt: string;
  html?: string;
  status: string;
  isPublished: boolean;
  isMultiPage?: boolean;
  pageCount?: number;
  description?: string;
  selectedModel?: string;
  providerId?: string;
  deploymentUrl?: string;
  repoUrl?: string;
  deployProvider?: string;
  deployedAt?: number;
  netlifySiteName?: string;
  createdAt: number;
}

interface ProjectCardProps {
  project: ProjectCardData;
  isDeleting: boolean;
  onDelete: (projectName: string) => void;
  onRedeploy: (project: ProjectCardData) => void;
}

export default function ProjectCard({
  project,
  isDeleting,
  onDelete,
  onRedeploy,
}: ProjectCardProps) {
  const router = useRouter();

  return (
    <div className="group relative flex flex-col bg-[var(--background-surface)] border border-[var(--border)] rounded-sm hover:border-[var(--primary)] transition-all duration-300">
      <div className="p-5 flex-1">
        <div className="flex justify-between items-start mb-4">
          <div className="space-y-1">
            <h2 className="text-sm font-mono font-black text-[var(--foreground)] tracking-tight group-hover:text-[var(--primary)] transition-colors">
              {project.projectName.toUpperCase()}
            </h2>
            {(project.status === 'error' || project.status === 'generating') && (
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  project.status === 'error' ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
                }`} />
                <span className={`text-[10px] font-mono uppercase tracking-wider ${
                  project.status === 'error' ? 'text-red-500' : 'text-amber-500'
                }`}>
                  {project.status === 'error' ? 'Failed' : 'Generating...'}
                </span>
                {project.status === 'error' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); router.push(`/edit/${project.projectName}`); }}
                    className="ml-1 text-[10px] font-mono text-red-400 hover:text-[var(--primary)] transition-colors flex items-center gap-1"
                    title="Retry generation"
                  >
                    <RefreshCw className="w-2.5 h-2.5" />
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-px bg-[var(--border)]/30 border border-[var(--border)]/30 mb-6 overflow-hidden rounded-sm">
          <div className="bg-[var(--background-surface)] p-3 space-y-1">
            <div className="flex items-center gap-1.5 opacity-50">
              <Layers className="w-2.5 h-2.5" />
              <span className="text-[11px] font-mono uppercase">No of Pages</span>
            </div>
            <div className="text-[11px] font-mono font-bold text-[var(--secondary-text)]">
              {project.pageCount || 1} Pages
            </div>
          </div>
          <div className="bg-[var(--background-surface)] p-3 space-y-1">
            <div className="flex items-center gap-1.5 opacity-50">
              <Calendar className="w-2.5 h-2.5" />
              <span className="text-[11px] font-mono uppercase">Last Sync</span>
            </div>
            <div className="text-[11px] font-mono font-bold text-[var(--secondary-text)]">
              {new Date(project.createdAt).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex items-center gap-1.5 opacity-50">
            <Globe className="w-2.5 h-2.5" />
            <span className="text-[11px] font-mono uppercase">Deployment</span>
          </div>
          <div className="text-[11px] font-mono font-bold text-[var(--secondary-text)]">
            {project.deploymentUrl ? (
              <>{project.deployProvider ? project.deployProvider.toUpperCase() : 'DEPLOYED'}</>
            ) : project.isPublished ? (
              <>HOSTED</>
            ) : (
              <>NOT DEPLOYED</>
            )}
          </div>
          {project.deploymentUrl && (
            <div className="text-[11px] font-mono text-[var(--muted-text)] break-all">
              {project.deploymentUrl}
            </div>
          )}
          <div className="flex items-center gap-2">
            {project.deploymentUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(project.deploymentUrl, '_blank')}
                className="h-7 px-3 text-[11px] font-mono uppercase border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                Open Live
              </Button>
            )}
            {project.repoUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(project.repoUrl, '_blank')}
                className="h-7 px-3 text-[11px] font-mono uppercase border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
              >
                Repo
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(project.projectName)}
            disabled={isDeleting}
            className="h-8 flex-1 text-red-500/60 hover:text-red-500 hover:bg-red-500/5 text-[11px] font-mono uppercase px-0"
          >
            <Trash2 className="w-3 h-3 mr-2" />
            Decom
          </Button>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="p-3 border-t border-[var(--border)] bg-[var(--background)]/50 grid grid-cols-5 gap-2">
        <Button
          onClick={() => router.push(`/edit/${project.projectName}`)}
          className="col-span-2 h-9 bg-[var(--foreground)] text-[var(--background)] hover:opacity-90 font-mono uppercase text-[10px] font-black rounded-none shadow-[2px_2px_0px_rgba(var(--primary-rgb),0.1)]"
        >
          Launch
        </Button>
        <Button
          variant="outline"
          onClick={() => router.push(`/edit/${project.projectName}/settings`)}
          className="h-9 border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)] font-mono uppercase text-[10px] font-bold rounded-none"
          title="Project Settings"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          onClick={() => onRedeploy(project)}
          className="h-9 border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)] font-mono uppercase text-[10px] font-bold rounded-none"
          title="Redeploy"
          disabled={!project.repoUrl}
        >
          <Rocket className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="outline"
          disabled={!project.deploymentUrl && !project.isPublished}
          onClick={() => {
            if (project.deploymentUrl) {
              window.open(project.deploymentUrl, '_blank');
            } else {
              window.open(`/results/${project.projectName}`, '_blank');
            }
          }}
          className="h-9 border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)] font-mono uppercase text-[10px] font-bold rounded-none disabled:opacity-20"
          title="View Live Site"
        >
          <Globe className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  );
}
