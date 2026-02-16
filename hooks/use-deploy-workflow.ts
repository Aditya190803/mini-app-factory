import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  extractNetlifySiteNameFromUrl,
  extractRepoFullNameFromUrl,
  extractRepoNameFromFullName,
  normalizeNetlifySiteName,
  normalizeRepoName,
  validateRepoName,
} from '@/lib/deploy-shared';
import { normalizeDeployError, performDeploy } from '@/lib/deploy-client';
import type { ProjectFile } from '@/lib/page-builder';

export type DeployOption = 'github-netlify' | 'github-only' | 'maf-hosted';
export type RepoCheckStatus = {
  status: 'idle' | 'checking' | 'available' | 'taken' | 'error';
  owner?: string;
  message?: string;
};
export type DeployResult = {
  repoUrl?: string;
  deploymentUrl?: string;
  netlifySiteName?: string;
} | null;

interface UseDeployWorkflowParams {
  projectName: string;
  initialPrompt: string;
  previewHtml: string;
  files: ProjectFile[];
  user: { id: string } | null | undefined;
  projectData: {
    _id?: string;
    repoUrl?: string | null;
    deploymentUrl?: string | null;
    netlifySiteName?: string | null;
    isPublished?: boolean;
  } | null | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  saveProject: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  publishProject: (args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDeploymentHistory: (args: any) => Promise<any>;
}

const INTEGRATION_CACHE_TTL = 30_000;

export function useDeployWorkflow({
  projectName,
  initialPrompt,
  previewHtml,
  files,
  user,
  projectData,
  saveProject,
  publishProject,
  addDeploymentHistory,
}: UseDeployWorkflowParams) {
  // Dialog visibility
  const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);

  // Deploy state
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [deployOption, setDeployOption] = useState<DeployOption>('github-netlify');
  const [deployResult, setDeployResult] = useState<DeployResult>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployNotice, setDeployNotice] = useState<string | null>(null);

  // Integration state
  const [integrationStatus, setIntegrationStatus] = useState({
    githubConnected: false,
    netlifyConnected: false,
  });
  const integrationCacheRef = useRef<{
    data: typeof integrationStatus;
    fetchedAt: number;
  } | null>(null);

  // GitHub state
  const [githubOrgs, setGithubOrgs] = useState<string[]>([]);
  const [githubOrg, setGithubOrg] = useState('personal');
  const [repoVisibility, setRepoVisibility] = useState<'private' | 'public'>('private');
  const [repoName, setRepoName] = useState(projectName);
  const [repoCheck, setRepoCheck] = useState<RepoCheckStatus>({ status: 'idle' });

  // Netlify state
  const [netlifySiteName, setNetlifySiteName] = useState('');

  const lastProjectNameRef = useRef(projectName);

  // ── Computed values ──────────────────────────────────────────

  const repoValidation = useMemo(() => validateRepoName(repoName), [repoName]);
  const normalizedRepoName = repoValidation.normalized || normalizeRepoName(projectName);
  const normalizedNetlifySiteName = useMemo(
    () => normalizeNetlifySiteName(netlifySiteName || normalizedRepoName),
    [netlifySiteName, normalizedRepoName],
  );
  const linkedRepoFullName = useMemo(
    () => extractRepoFullNameFromUrl(projectData?.repoUrl),
    [projectData?.repoUrl],
  );
  const linkedRepoName = useMemo(
    () => extractRepoNameFromFullName(linkedRepoFullName),
    [linkedRepoFullName],
  );
  const repoMismatch = useMemo(
    () => !!(linkedRepoName && normalizedRepoName && linkedRepoName !== normalizedRepoName),
    [linkedRepoName, normalizedRepoName],
  );

  // ── Fetchers ─────────────────────────────────────────────────

  const fetchIntegrationStatus = useCallback(async () => {
    const cached = integrationCacheRef.current;
    if (cached && Date.now() - cached.fetchedAt < INTEGRATION_CACHE_TTL) {
      setIntegrationStatus(cached.data);
      return;
    }
    try {
      const resp = await fetch('/api/integrations/status');
      const fallback = { githubConnected: false, netlifyConnected: false };
      if (resp.status === 401 || !resp.ok) {
        setIntegrationStatus(fallback);
        return;
      }
      const data = await resp.json();
      const result = {
        githubConnected: !!data.githubConnected,
        netlifyConnected: !!data.netlifyConnected,
      };
      integrationCacheRef.current = { data: result, fetchedAt: Date.now() };
      setIntegrationStatus(result);
    } catch (err) {
      console.error(err);
      setIntegrationStatus({ githubConnected: false, netlifyConnected: false });
    }
  }, []);

  const fetchGithubOrgs = useCallback(async () => {
    try {
      const resp = await fetch('/api/integrations/github/orgs');
      if (!resp.ok) {
        setGithubOrgs([]);
        return;
      }
      const data = await resp.json();
      setGithubOrgs(Array.isArray(data.orgs) ? data.orgs : []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  // ── Effects ──────────────────────────────────────────────────

  // Fetch integration status when dialog opens
  useEffect(() => {
    if (!isDeployDialogOpen) return;
    fetchIntegrationStatus();
  }, [isDeployDialogOpen, fetchIntegrationStatus]);

  // Fetch GitHub orgs when dialog opens and GitHub is connected
  useEffect(() => {
    if (!isDeployDialogOpen) return;
    if (integrationStatus.githubConnected) fetchGithubOrgs();
  }, [isDeployDialogOpen, integrationStatus.githubConnected, fetchGithubOrgs]);

  // Auto-open dialog on ?connected= return from OAuth
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('connected');
    if (connected) {
      setIsDeployDialogOpen(true);
      params.delete('connected');
      const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      window.history.replaceState(null, '', next);
    }
  }, []);

  // Sync repo name with project name or linked repo
  useEffect(() => {
    if (linkedRepoName) {
      setRepoName(linkedRepoName);
      return;
    }
    if (repoName === '' || repoName === lastProjectNameRef.current) {
      setRepoName(projectName);
    }
    lastProjectNameRef.current = projectName;
  }, [projectName, repoName, linkedRepoName]);

  // Sync netlify site name from project data
  useEffect(() => {
    if (projectData?.netlifySiteName) setNetlifySiteName(projectData.netlifySiteName);
  }, [projectData?.netlifySiteName]);

  // Auto-dismiss deploy notice
  useEffect(() => {
    if (!deployNotice) return;
    const timer = window.setTimeout(() => setDeployNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [deployNotice]);

  // Reset error/result when deploy option changes
  useEffect(() => {
    setDeployResult((prev) =>
      prev?.repoUrl || prev?.deploymentUrl || prev?.netlifySiteName ? prev : null,
    );
    setDeployError(null);
  }, [deployOption]);

  // Restore deploy result from project data on dialog open
  useEffect(() => {
    if (!isDeployDialogOpen || !projectData) return;
    if (projectData.repoUrl || projectData.deploymentUrl || projectData.netlifySiteName) {
      setDeployResult({
        repoUrl: projectData.repoUrl ?? undefined,
        deploymentUrl: projectData.deploymentUrl ?? undefined,
        netlifySiteName: projectData.netlifySiteName ?? undefined,
      });
    }
  }, [
    isDeployDialogOpen,
    projectData?.repoUrl,
    projectData?.deploymentUrl,
    projectData?.netlifySiteName,
    projectData,
  ]);

  // Debounced repo name availability check
  useEffect(() => {
    if (!repoValidation.valid) {
      setRepoCheck({ status: 'error', message: repoValidation.message });
      return;
    }
    if (!normalizedRepoName) {
      setRepoCheck({ status: 'idle' });
      return;
    }
    if (deployOption === 'maf-hosted') return;
    if (!integrationStatus.githubConnected) return;
    if (projectData?.repoUrl) {
      setRepoCheck({ status: 'available', message: 'Linked repo will be reused.' });
      return;
    }

    const handle = window.setTimeout(async () => {
      setRepoCheck({ status: 'checking' });
      try {
        const ownerParam =
          githubOrg === 'personal' ? '' : `&owner=${encodeURIComponent(githubOrg)}`;
        const resp = await fetch(
          `/api/integrations/github/check-repo?name=${encodeURIComponent(normalizedRepoName)}${ownerParam}`,
        );
        if (!resp.ok) {
          setRepoCheck({ status: 'error', message: 'Unable to verify repo name.' });
          return;
        }
        const data = await resp.json();
        if (data.available) {
          setRepoCheck({ status: 'available', owner: data.owner });
        } else {
          setRepoCheck({ status: 'taken', owner: data.owner, message: 'Name already exists.' });
        }
      } catch (err) {
        console.error(err);
        setRepoCheck({ status: 'error', message: 'Unable to verify repo name.' });
      }
    }, 500);

    return () => window.clearTimeout(handle);
  }, [
    normalizedRepoName,
    repoValidation.valid,
    repoValidation.message,
    githubOrg,
    deployOption,
    integrationStatus.githubConnected,
    projectData?.repoUrl,
  ]);

  // ── Actions ──────────────────────────────────────────────────

  const startGithubConnect = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/integrations/github/start?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const startNetlifyConnect = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/integrations/netlify/start?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setDeployNotice(`${label} copied to clipboard.`);
    } catch (err) {
      console.error(err);
      setDeployNotice(`Unable to copy ${label}.`);
    }
  }, []);

  const handleHostedDeploy = useCallback(async () => {
    if (!user) {
      window.location.href = '/handler/sign-in';
      return;
    }
    setIsDeploying(true);
    setDeployError(null);
    setDeployResult(null);
    setDeployNotice(null);
    try {
      const resultsPath = `/results/${projectName}`;
      const resultsUrl = `${window.location.origin}${resultsPath}`;
      await saveProject({
        projectName,
        prompt: initialPrompt,
        html: previewHtml,
        status: 'completed',
        userId: user.id,
        isPublished: true,
        isMultiPage: files.length > 1,
        pageCount: files.filter((f) => f.fileType === 'page').length,
        deploymentUrl: resultsUrl,
        repoUrl: undefined,
        deployProvider: 'maf-hosted',
        deployedAt: Date.now(),
        netlifySiteName: undefined,
      });
      await publishProject({ projectName, userId: user.id });
      setDeployResult({ deploymentUrl: resultsUrl });
      if (projectData?._id) {
        await addDeploymentHistory({
          projectId: projectData._id,
          provider: 'maf-hosted',
          deploymentUrl: resultsUrl,
        });
      }
      window.open(resultsPath, '_blank');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Publish failed';
      const normalized = normalizeDeployError(message);
      setDeployError(normalized);
      toast.error('Deploy failed', { description: normalized });
    } finally {
      setIsDeploying(false);
    }
  }, [user, projectName, initialPrompt, previewHtml, files, saveProject, publishProject, projectData?._id, addDeploymentHistory]);

  const handleDeploy = useCallback(async () => {
    if (!user) {
      window.location.href = '/handler/sign-in';
      return;
    }
    if (deployOption === 'maf-hosted') {
      await handleHostedDeploy();
      return;
    }
    setIsDeploying(true);
    setDeployStatus('Starting deployment...');
    setDeployError(null);
    setDeployResult(null);
    setDeployNotice(null);
    try {
      const data = await performDeploy(
        {
          projectName,
          prompt: initialPrompt,
          repoVisibility,
          githubOrg: githubOrg === 'personal' ? null : githubOrg,
          deployMode: deployOption,
          repoName: normalizedRepoName || projectName,
          repoFullName: linkedRepoFullName,
          netlifySiteName:
            deployOption === 'github-netlify' ? normalizedNetlifySiteName : undefined,
        },
        (status) => setDeployStatus(status),
      );
      setDeployResult({
        repoUrl: data.repoUrl,
        deploymentUrl: data.deploymentUrl,
        netlifySiteName: data.netlifySiteName,
      });
      await saveProject({
        projectName,
        prompt: initialPrompt,
        html: previewHtml,
        status: 'completed',
        userId: user.id,
        isPublished: projectData?.isPublished ?? false,
        isMultiPage: files.length > 1,
        pageCount: files.filter((f) => f.fileType === 'page').length,
        deploymentUrl: data.deploymentUrl ?? undefined,
        repoUrl: data.repoUrl ?? undefined,
        deployProvider: deployOption === 'github-only' ? 'github' : 'netlify',
        deployedAt: Date.now(),
        netlifySiteName:
          data.netlifySiteName ?? extractNetlifySiteNameFromUrl(data.deploymentUrl) ?? undefined,
      });
      if (projectData?._id) {
        await addDeploymentHistory({
          projectId: projectData._id,
          provider: deployOption === 'github-only' ? 'github' : 'netlify',
          deploymentUrl: data.deploymentUrl ?? undefined,
          repoUrl: data.repoUrl ?? undefined,
          netlifySiteName: data.netlifySiteName ?? undefined,
        });
      }
      // Invalidate cache after deploy
      integrationCacheRef.current = null;
      fetchIntegrationStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed';
      const normalized = normalizeDeployError(message);
      setDeployError(normalized);
      toast.error('Deploy failed', { description: normalized });
    } finally {
      setIsDeploying(false);
    }
  }, [
    user,
    deployOption,
    handleHostedDeploy,
    projectName,
    initialPrompt,
    repoVisibility,
    githubOrg,
    normalizedRepoName,
    linkedRepoFullName,
    normalizedNetlifySiteName,
    previewHtml,
    files,
    saveProject,
    projectData,
    addDeploymentHistory,
    fetchIntegrationStatus,
  ]);

  /** Whether the deploy button should be disabled. */
  const isDeployDisabled = useMemo(() => {
    if (isDeploying) return true;
    if (deployOption === 'github-netlify' &&
        (!integrationStatus.githubConnected || !integrationStatus.netlifyConnected)) return true;
    if (deployOption === 'github-only' && !integrationStatus.githubConnected) return true;
    if (deployOption !== 'maf-hosted' &&
        (repoCheck.status === 'taken' || repoCheck.status === 'error' || !repoValidation.valid)) return true;
    return false;
  }, [isDeploying, deployOption, integrationStatus, repoCheck.status, repoValidation.valid]);

  return {
    // Dialog
    isDeployDialogOpen,
    setIsDeployDialogOpen,
    // Deploy state
    isDeploying,
    deployStatus,
    deployOption,
    setDeployOption,
    deployResult,
    deployError,
    deployNotice,
    // Integration
    integrationStatus,
    // GitHub
    githubOrgs,
    githubOrg,
    setGithubOrg,
    repoVisibility,
    setRepoVisibility,
    repoName,
    setRepoName,
    repoCheck,
    // Netlify
    netlifySiteName,
    setNetlifySiteName,
    // Computed
    repoValidation,
    normalizedRepoName,
    normalizedNetlifySiteName,
    linkedRepoFullName,
    linkedRepoName,
    repoMismatch,
    isDeployDisabled,
    // Actions
    handleDeploy,
    startGithubConnect,
    startNetlifyConnect,
    copyToClipboard,
  };
}
