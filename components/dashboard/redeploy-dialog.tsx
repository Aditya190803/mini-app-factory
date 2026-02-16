'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import {
  extractRepoFullNameFromUrl,
  extractRepoNameFromFullName,
  normalizeNetlifySiteName,
  normalizeRepoName,
  validateRepoName,
} from '@/lib/deploy-shared';
import { normalizeDeployError, performDeploy } from '@/lib/deploy-client';
import { toast } from 'sonner';
import type { ProjectCardData } from './project-card';

interface RedeployDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectCardData | null;
  userId: string;
}

export default function RedeployDialog({
  open,
  onOpenChange,
  project,
  userId,
}: RedeployDialogProps) {
  const saveProject = useMutation(api.projects.saveProject);
  const addDeploymentHistory = useMutation(api.deployments.addDeploymentHistory);

  const [redeployOption, setRedeployOption] = useState<'github-netlify' | 'github-only'>('github-netlify');
  const [redeployRepoName, setRedeployRepoName] = useState('');
  const [redeployNetlifySiteName, setRedeployNetlifySiteName] = useState('');
  const [redeployResult, setRedeployResult] = useState<{ repoUrl?: string; deploymentUrl?: string; netlifySiteName?: string } | null>(null);
  const [redeployError, setRedeployError] = useState<string | null>(null);
  const [isRedeploying, setIsRedeploying] = useState(false);
  const [redeployStatus, setRedeployStatus] = useState<string | null>(null);
  const [isIntegrationLoading, setIsIntegrationLoading] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<{ githubConnected: boolean; netlifyConnected: boolean }>({
    githubConnected: false,
    netlifyConnected: false,
  });

  const redeployFiles = useQuery(
    api.files.getFilesByProject,
    project?._id ? { projectId: project._id as never } : 'skip',
  );

  const linkedRepoFullName = useMemo(
    () => extractRepoFullNameFromUrl(project?.repoUrl),
    [project?.repoUrl],
  );
  const linkedRepoName = useMemo(
    () => extractRepoNameFromFullName(linkedRepoFullName),
    [linkedRepoFullName],
  );
  const repoValidation = useMemo(() => validateRepoName(redeployRepoName), [redeployRepoName]);
  const normalizedRepoName = repoValidation.normalized || normalizeRepoName(project?.projectName ?? '');
  const normalizedNetlifySiteNameValue = useMemo(
    () => normalizeNetlifySiteName(redeployNetlifySiteName || normalizedRepoName),
    [redeployNetlifySiteName, normalizedRepoName],
  );

  // Reset state when project changes
  useEffect(() => {
    if (!project) return;
    const provider = project.deployProvider === 'github' ? 'github-only' : 'github-netlify';
    setRedeployOption(provider);
    setRedeployRepoName(linkedRepoName || project.projectName);
    setRedeployNetlifySiteName(project.netlifySiteName || '');
    setRedeployResult(null);
    setRedeployError(null);
  }, [project, linkedRepoName]);

  // Fetch integration status when dialog opens
  useEffect(() => {
    if (!open) return;
    const loadStatus = async () => {
      setIsIntegrationLoading(true);
      try {
        const resp = await fetch('/api/integrations/status');
        if (!resp.ok) {
          setIntegrationStatus({ githubConnected: false, netlifyConnected: false });
          return;
        }
        const data = await resp.json();
        setIntegrationStatus({
          githubConnected: !!data.githubConnected,
          netlifyConnected: !!data.netlifyConnected,
        });
      } finally {
        setIsIntegrationLoading(false);
      }
    };
    loadStatus();
  }, [open]);

  const handleRedeploy = useCallback(async () => {
    if (!project) return;
    if (!redeployFiles || redeployFiles.length === 0) {
      const message = 'Project files are still loading. Please try again in a moment.';
      setRedeployError(message);
      toast.error('Redeploy blocked', { description: message });
      return;
    }

    setIsRedeploying(true);
    setRedeployStatus('Starting redeployment...');
    setRedeployError(null);
    setRedeployResult(null);
    try {
      const data = await performDeploy(
        {
          projectName: project.projectName,
          prompt: project.prompt,
          repoVisibility: 'private',
          githubOrg: null,
          deployMode: redeployOption,
          repoName: normalizedRepoName || project.projectName,
          repoFullName: linkedRepoFullName,
          netlifySiteName: redeployOption === 'github-netlify' ? normalizedNetlifySiteNameValue : undefined,
        },
        (status) => setRedeployStatus(status),
      );

      setRedeployResult({
        repoUrl: data.repoUrl,
        deploymentUrl: data.deploymentUrl,
        netlifySiteName: data.netlifySiteName,
      });

      await saveProject({
        projectName: project.projectName,
        prompt: project.prompt,
        html: project.html,
        status: project.status as 'pending' | 'generating' | 'completed' | 'error',
        userId,
        isPublished: project.isPublished,
        isMultiPage: project.isMultiPage,
        pageCount: project.pageCount,
        description: project.description,
        selectedModel: project.selectedModel,
        providerId: project.providerId,
        deploymentUrl: data.deploymentUrl ?? undefined,
        repoUrl: data.repoUrl ?? undefined,
        deployProvider: redeployOption === 'github-only' ? 'github' : 'netlify',
        deployedAt: Date.now(),
        netlifySiteName: data.netlifySiteName ?? undefined,
      });

      await addDeploymentHistory({
        projectId: project._id as never,
        provider: redeployOption === 'github-only' ? 'github' : 'netlify',
        deploymentUrl: data.deploymentUrl ?? undefined,
        repoUrl: data.repoUrl ?? undefined,
        netlifySiteName: data.netlifySiteName ?? undefined,
      });

      toast.success('Redeploy complete', { description: data.deploymentUrl || 'Deployment finished.' });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed';
      const normalized = normalizeDeployError(message);
      setRedeployError(normalized);
      toast.error('Redeploy failed', { description: normalized });
    } finally {
      setIsRedeploying(false);
    }
  }, [
    project,
    redeployFiles,
    redeployOption,
    normalizedRepoName,
    linkedRepoFullName,
    normalizedNetlifySiteNameValue,
    userId,
    saveProject,
    addDeploymentHistory,
  ]);

  const startGithubConnect = () => {
    window.location.href = `/api/integrations/github/start?returnTo=${encodeURIComponent('/dashboard')}`;
  };

  const startNetlifyConnect = () => {
    window.location.href = `/api/integrations/netlify/start?returnTo=${encodeURIComponent('/dashboard')}`;
  };

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setRedeployResult(null);
      setRedeployError(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase text-sm tracking-tight">
            Redeploy {project?.projectName}
          </DialogTitle>
          <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
            Trigger a fresh deploy directly from the dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2" role="radiogroup" aria-label="Deploy Options">
            <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]" id="deploy-options-label">
              Deploy Options
            </label>
            <button
              type="button"
              role="radio"
              aria-checked={redeployOption === 'github-netlify'}
              onClick={() => setRedeployOption('github-netlify')}
              className={`w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all ${
                redeployOption === 'github-netlify'
                  ? 'border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]'
                  : 'border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]'
              }`}
            >
              GitHub + Netlify
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={redeployOption === 'github-only'}
              onClick={() => setRedeployOption('github-only')}
              className={`w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all ${
                redeployOption === 'github-only'
                  ? 'border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]'
                  : 'border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]'
              }`}
            >
              GitHub Repo Only
            </button>
          </div>

          <div className="grid gap-2">
            <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Repo Name</label>
            <Input
              value={redeployRepoName}
              onChange={(e) => setRedeployRepoName(e.target.value)}
              placeholder={project?.projectName}
              className="text-xs font-mono bg-[var(--background)] border-[var(--border)] focus-visible:ring-[var(--primary)]"
              disabled={!!linkedRepoFullName}
            />
            <div className="text-[10px] font-mono text-[var(--muted-text)]">
              {linkedRepoFullName && `Linked repo: ${linkedRepoFullName}. Repo name locked. `}
              {normalizedRepoName && `Slug: ${normalizedRepoName}. `}
              {!repoValidation.valid && repoValidation.message}
            </div>
          </div>

          {redeployOption === 'github-netlify' && (
            <div className="grid gap-2">
              <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Netlify Site Name</label>
              <Input
                value={redeployNetlifySiteName}
                onChange={(e) => setRedeployNetlifySiteName(e.target.value)}
                placeholder={normalizedRepoName || project?.projectName}
                className="text-xs font-mono bg-[var(--background)] border-[var(--border)] focus-visible:ring-[var(--primary)]"
              />
              <div className="text-[10px] font-mono text-[var(--muted-text)]">
                Subdomain slug: {normalizedNetlifySiteNameValue || '—'}.
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
            <div>
              <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">GitHub</div>
              <div className="text-[11px] text-[var(--muted-text)]">
                {isIntegrationLoading ? 'Checking...' : integrationStatus.githubConnected ? 'Connected' : 'Not connected'}
              </div>
            </div>
            <Button
              onClick={startGithubConnect}
              variant="outline"
              className="font-mono uppercase text-[10px] border-[var(--border)]"
            >
              {integrationStatus.githubConnected ? 'Reconnect' : 'Connect'}
            </Button>
          </div>

          {redeployOption === 'github-netlify' && (
            <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
              <div>
                <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">Netlify</div>
                <div className="text-[11px] text-[var(--muted-text)]">
                  {isIntegrationLoading ? 'Checking...' : integrationStatus.netlifyConnected ? 'Connected' : 'Not connected'}
                </div>
              </div>
              <Button
                onClick={startNetlifyConnect}
                variant="outline"
                className="font-mono uppercase text-[10px] border-[var(--border)]"
              >
                {integrationStatus.netlifyConnected ? 'Reconnect' : 'Connect'}
              </Button>
            </div>
          )}

          {redeployResult?.repoUrl && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Repo: <span className="text-[var(--primary)]">{redeployResult.repoUrl}</span>
              </div>
            </div>
          )}
          {redeployResult?.deploymentUrl && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Live URL: <span className="text-[var(--primary)]">{redeployResult.deploymentUrl}</span>
              </div>
            </div>
          )}
          {redeployResult?.netlifySiteName && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Netlify Site: <span className="text-[var(--primary)]">{redeployResult.netlifySiteName}</span>
              </div>
            </div>
          )}
          {redeployFiles === undefined && (
            <div className="text-[11px] text-[var(--muted-text)] font-mono flex items-center gap-2">
              <Spinner className="text-[var(--primary)]" />
              Loading project files...
            </div>
          )}
          {redeployError && (
            <div className="text-[11px] text-red-500 font-mono whitespace-pre-wrap">{redeployError}</div>
          )}
          {isRedeploying && redeployStatus && (
            <div className="p-3 border border-[var(--border)] rounded-md bg-[var(--background-overlay)]/30 space-y-2 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-[var(--primary)] rounded-full animate-pulse" />
                <span className="text-[10px] font-mono uppercase font-bold text-[var(--secondary-text)] tracking-wider">
                  Redeployment Status
                </span>
              </div>
              <div className="text-[12px] font-mono text-[var(--foreground)] pl-4 border-l-2 border-[var(--primary)]/30 py-1">
                {redeployStatus}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            className="flex-1 font-mono uppercase text-[10px] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background-overlay)]"
          >
            Close
          </Button>
          <Button
            onClick={handleRedeploy}
            disabled={
              isRedeploying ||
              !repoValidation.valid ||
              (redeployOption === 'github-netlify' && !integrationStatus.netlifyConnected) ||
              !integrationStatus.githubConnected ||
              redeployFiles === undefined
            }
            className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
          >
            {isRedeploying ? 'Deploying...' : 'Redeploy Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
