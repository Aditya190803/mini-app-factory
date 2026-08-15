'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProjectFile } from '@/lib/page-builder';
import {
  extractNetlifySiteNameFromUrl,
  extractRepoFullNameFromUrl,
  extractRepoNameFromFullName,
  normalizeCloudflareProjectName,
  normalizeNetlifySiteName,
  normalizeRepoName,
  validateRepoName,
} from '@/lib/deploy-shared';
import { normalizeDeployError, performDeploy } from '@/lib/deploy-client';
import type { FunctionArgs } from 'convex/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';

export type DeployOption = 'github-netlify' | 'github-only' | 'cloudflare' | 'maf-hosted';

type ProjectDeployMeta = {
  // Convex's branded id, not a bare string — addDeploymentHistory takes an Id<"projects">, and
  // widening it here is what let the mismatch through.
  _id?: Id<'projects'>;
  repoUrl?: string | null;
  deploymentUrl?: string | null;
  netlifySiteName?: string | null;
  cloudflareProjectName?: string | null;
  isPublished?: boolean;
};

/**
 * Mutation props are typed against the real Convex argument types rather than `object`.
 *
 * They used to be widened, which silently hid two live bugs: this hook passed a `userId` to
 * `saveProject` and `publishProject` long after those mutations stopped accepting one (they derive
 * the owner from the verified identity now). Convex rejects unknown arguments at runtime, so every
 * post-deploy metadata write was throwing and no deployment URL was ever persisted. Keeping these
 * types honest is what makes that a compile error instead of a silent failure in production.
 */
type UseEditorDeployArgs = {
  projectName: string;
  initialPrompt: string;
  files: ProjectFile[];
  userId: string | undefined;
  projectData: ProjectDeployMeta | null | undefined;
  saveProject: (args: FunctionArgs<typeof api.projects.saveProject>) => Promise<unknown>;
  publishProject: (args: FunctionArgs<typeof api.projects.publishProject>) => Promise<unknown>;
  addDeploymentHistory: (
    args: FunctionArgs<typeof api.deployments.addDeploymentHistory>
  ) => Promise<unknown>;
};

export function useEditorDeploy(args: UseEditorDeployArgs) {
  const {
    projectName,
    initialPrompt,
    files,
    userId,
    projectData,
    saveProject,
    publishProject,
    addDeploymentHistory,
  } = args;

  const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState({
    githubConnected: false,
    netlifyConnected: false,
    cloudflareConnected: false,
    cloudflareAccountName: undefined as string | undefined,
  });
  const [githubOrgs, setGithubOrgs] = useState<string[]>([]);
  const [githubOrg, setGithubOrg] = useState('personal');
  const [repoVisibility, setRepoVisibility] = useState<'private' | 'public'>('private');
  const [deployOption, setDeployOption] = useState<DeployOption>('github-netlify');
  const [repoName, setRepoName] = useState(projectName);
  const [netlifySiteName, setNetlifySiteName] = useState('');
  const [cloudflareProjectName, setCloudflareProjectName] = useState('');
  const [repoCheck, setRepoCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'error';
    owner?: string;
    message?: string;
  }>({ status: 'idle' });
  const [deployResult, setDeployResult] = useState<{
    repoUrl?: string;
    deploymentUrl?: string;
    netlifySiteName?: string;
    deploymentId?: string;
    previewUrl?: string;
    cloudflareProjectName?: string;
  } | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [resourcePlan, setResourcePlan] = useState<Array<{
    kind: string;
    binding: string;
    name: string;
    action: 'reuse' | 'create' | 'reference';
  }> | null>(null);
  const [isPlanningResources, setIsPlanningResources] = useState(false);
  const [deployNotice, setDeployNotice] = useState<string | null>(null);
  const lastProjectNameRef = useRef(projectName);
  const repoCheckRequestRef = useRef(0);

  const repoValidation = useMemo(() => validateRepoName(repoName), [repoName]);
  const normalizedRepoName = repoValidation.normalized || normalizeRepoName(projectName);
  const normalizedNetlifySiteName = useMemo(
    () => normalizeNetlifySiteName(netlifySiteName || normalizedRepoName),
    [netlifySiteName, normalizedRepoName]
  );
  const normalizedCloudflareProjectName = useMemo(
    () => normalizeCloudflareProjectName(cloudflareProjectName || projectName),
    [cloudflareProjectName, projectName]
  );
  const linkedRepoFullName = useMemo(() => extractRepoFullNameFromUrl(projectData?.repoUrl), [projectData?.repoUrl]);
  const linkedRepoName = useMemo(() => extractRepoNameFromFullName(linkedRepoFullName), [linkedRepoFullName]);
  const repoMismatch = useMemo(
    () => !!(linkedRepoName && normalizedRepoName && linkedRepoName !== normalizedRepoName),
    [linkedRepoName, normalizedRepoName]
  );

  const fetchIntegrationStatus = useCallback(async () => {
    const disconnected = {
      githubConnected: false,
      netlifyConnected: false,
      cloudflareConnected: false,
      cloudflareAccountName: undefined,
    };
    try {
      const resp = await fetch('/api/integrations/status');
      if (!resp.ok) {
        setIntegrationStatus(disconnected);
        return;
      }
      const data = await resp.json();
      setIntegrationStatus({
        githubConnected: !!data.githubConnected,
        netlifyConnected: !!data.netlifyConnected,
        cloudflareConnected: !!data.cloudflareConnected,
        cloudflareAccountName: data.cloudflareAccountName,
      });
    } catch {
      setIntegrationStatus(disconnected);
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
    } catch {
      setGithubOrgs([]);
    }
  }, []);

  useEffect(() => {
    if (!isDeployDialogOpen) return;
    fetchIntegrationStatus();
  }, [isDeployDialogOpen, fetchIntegrationStatus]);

  useEffect(() => {
    if (!isDeployDialogOpen || !integrationStatus.githubConnected) return;
    fetchGithubOrgs();
  }, [isDeployDialogOpen, integrationStatus.githubConnected, fetchGithubOrgs]);

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

  useEffect(() => {
    if (projectData?.netlifySiteName) setNetlifySiteName(projectData.netlifySiteName);
  }, [projectData?.netlifySiteName]);

  useEffect(() => {
    setCloudflareProjectName(projectData?.cloudflareProjectName || projectName);
  }, [projectData?.cloudflareProjectName, projectName]);

  useEffect(() => {
    if (!deployNotice) return;
    const timer = window.setTimeout(() => setDeployNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [deployNotice]);

  useEffect(() => {
    setDeployResult((prev) =>
      prev?.repoUrl || prev?.deploymentUrl || prev?.netlifySiteName || prev?.cloudflareProjectName ? prev : null
    );
    setDeployError(null);
    setResourcePlan(null);
  }, [deployOption]);

  useEffect(() => {
    if (!isDeployDialogOpen || !projectData) return;
    if (projectData.repoUrl || projectData.deploymentUrl || projectData.netlifySiteName) {
      setDeployResult({
        repoUrl: projectData.repoUrl ?? undefined,
        deploymentUrl: projectData.deploymentUrl ?? undefined,
        netlifySiteName: projectData.netlifySiteName ?? undefined,
      });
    }
  }, [isDeployDialogOpen, projectData?.repoUrl, projectData?.deploymentUrl, projectData?.netlifySiteName, projectData]);

  useEffect(() => {
    if (!repoValidation.valid) {
      setRepoCheck({ status: 'error', message: repoValidation.message });
      return;
    }
    if (!normalizedRepoName) {
      setRepoCheck({ status: 'idle' });
      return;
    }
    if (deployOption === 'maf-hosted' || deployOption === 'cloudflare') return;
    if (!integrationStatus.githubConnected) return;
    if (projectData?.repoUrl) {
      setRepoCheck({ status: 'available', message: 'Linked repo will be reused.' });
      return;
    }

    const requestId = ++repoCheckRequestRef.current;
    setRepoCheck({ status: 'checking' });

    const handle = window.setTimeout(async () => {
      try {
        const ownerParam = githubOrg === 'personal' ? '' : `&owner=${encodeURIComponent(githubOrg)}`;
        const resp = await fetch(
          `/api/integrations/github/check-repo?name=${encodeURIComponent(normalizedRepoName)}${ownerParam}`
        );
        if (repoCheckRequestRef.current !== requestId) return;
        if (!resp.ok) {
          setRepoCheck({ status: 'error', message: 'Unable to verify repo name.' });
          return;
        }
        const data = await resp.json();
        if (repoCheckRequestRef.current !== requestId) return;
        if (data.available) {
          setRepoCheck({ status: 'available', owner: data.owner });
        } else {
          setRepoCheck({ status: 'taken', owner: data.owner, message: 'Name already exists.' });
        }
      } catch {
        if (repoCheckRequestRef.current === requestId) {
          setRepoCheck({ status: 'error', message: 'Unable to verify repo name.' });
        }
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

  const copyToClipboard = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setDeployNotice(`${label} copied to clipboard.`);
    } catch {
      setDeployNotice(`Unable to copy ${label}.`);
    }
  }, []);

  const startGithubConnect = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/integrations/github/start?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const startNetlifyConnect = useCallback(() => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/integrations/netlify/start?returnTo=${encodeURIComponent(returnTo)}`;
  }, []);

  const persistDeployMeta = useCallback(
    async (meta: {
      deploymentUrl?: string;
      repoUrl?: string;
      deployProvider: string;
      netlifySiteName?: string;
      isPublished?: boolean;
    }) => {
      if (!userId) return;
      await saveProject({
        projectName,
        prompt: initialPrompt,
        // Deliberately no `html`. This used to write the editor's preview build, which is
        // assembled with isEditorPreview=true — it carries the ~190-line VFS/element-selector
        // bridge script and inlines every stylesheet. project.html is the legacy fallback that
        // /results serves when a project has no files, so a published site could end up shipping
        // the editor's internal tooling. projectFiles are the source of truth; saveProject
        // preserves the existing value when html is omitted.
        status: 'completed',
        isPublished: meta.isPublished ?? projectData?.isPublished ?? false,
        isMultiPage: files.length > 1,
        pageCount: files.filter((f) => f.fileType === 'page').length,
        deploymentUrl: meta.deploymentUrl,
        repoUrl: meta.repoUrl,
        deployProvider: meta.deployProvider,
        deployedAt: Date.now(),
        netlifySiteName: meta.netlifySiteName,
      });
    },
    [userId, saveProject, projectName, initialPrompt, projectData?.isPublished, files]
  );

  const handleHostedDeploy = useCallback(async () => {
    if (!userId) {
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
      await persistDeployMeta({ deploymentUrl: resultsUrl, deployProvider: 'maf-hosted', isPublished: true });
      await publishProject({ projectName });
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
      const normalized = normalizeDeployError(err instanceof Error ? err.message : 'Publish failed');
      setDeployError(normalized);
      toast.error('Deploy failed', { description: normalized });
    } finally {
      setIsDeploying(false);
    }
  }, [
    userId,
    projectName,
    persistDeployMeta,
    publishProject,
    projectData?._id,
    addDeploymentHistory,
  ]);

  const runDeploy = useCallback(async (confirmCloudflareResources = false) => {
    if (!userId) {
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
          netlifySiteName: deployOption === 'github-netlify' ? normalizedNetlifySiteName : undefined,
          cloudflareProjectName: deployOption === 'cloudflare' ? normalizedCloudflareProjectName : undefined,
          confirmCloudflareResources: deployOption === 'cloudflare' ? confirmCloudflareResources : undefined,
        },
        (status) => setDeployStatus(status)
      );
      setDeployResult({
        repoUrl: data.repoUrl,
        deploymentUrl: data.deploymentUrl,
        netlifySiteName: data.netlifySiteName,
        deploymentId: data.deploymentId,
        previewUrl: data.previewUrl,
        cloudflareProjectName: data.cloudflareProjectName,
      });
      await persistDeployMeta({
        deploymentUrl: data.deploymentUrl ?? undefined,
        repoUrl: data.repoUrl ?? undefined,
        deployProvider: deployOption === 'github-only' ? 'github' : deployOption === 'cloudflare' ? 'cloudflare' : 'netlify',
        netlifySiteName: data.netlifySiteName ?? extractNetlifySiteNameFromUrl(data.deploymentUrl) ?? undefined,
      });
      if (projectData?._id) {
        await addDeploymentHistory({
          projectId: projectData._id,
          provider: deployOption === 'github-only' ? 'github' : deployOption === 'cloudflare' ? 'cloudflare' : 'netlify',
          deploymentUrl: data.deploymentUrl ?? undefined,
          repoUrl: data.repoUrl ?? undefined,
          netlifySiteName: data.netlifySiteName ?? undefined,
          cloudflareProjectName: data.cloudflareProjectName ?? undefined,
          cloudflareDeploymentId: data.deploymentId ?? undefined,
        });
      }
      fetchIntegrationStatus();
    } catch (err) {
      const normalized = normalizeDeployError(err instanceof Error ? err.message : 'Deploy failed');
      setDeployError(normalized);
      toast.error('Deploy failed', { description: normalized });
    } finally {
      setIsDeploying(false);
    }
  }, [
    userId,
    deployOption,
    handleHostedDeploy,
    projectName,
    initialPrompt,
    repoVisibility,
    githubOrg,
    normalizedRepoName,
    linkedRepoFullName,
    normalizedNetlifySiteName,
    normalizedCloudflareProjectName,
    persistDeployMeta,
    projectData?._id,
    addDeploymentHistory,
    fetchIntegrationStatus,
  ]);

  const handleDeploy = useCallback(async () => {
    if (!userId) {
      window.location.href = '/handler/sign-in';
      return;
    }
    if (deployOption !== 'cloudflare') {
      await runDeploy();
      return;
    }

    setIsPlanningResources(true);
    setDeployError(null);
    try {
      const response = await fetch('/api/cloudflare/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, cloudflareProjectName: normalizedCloudflareProjectName }),
      });
      const plan = await response.json();
      if (!response.ok) throw new Error(plan.error || 'Unable to plan Cloudflare resources');
      if (plan.needsConfirmation) {
        setResourcePlan(plan.actions);
        return;
      }
      await runDeploy();
    } catch (error) {
      const message = normalizeDeployError(error instanceof Error ? error.message : 'Unable to plan Cloudflare resources');
      setDeployError(message);
      toast.error('Resource plan failed', { description: message });
    } finally {
      setIsPlanningResources(false);
    }
  }, [deployOption, normalizedCloudflareProjectName, projectName, runDeploy, userId]);

  const confirmResourcePlan = useCallback(async () => {
    setResourcePlan(null);
    await runDeploy(true);
  }, [runDeploy]);

  const markCloudflareConnected = useCallback((account: { name: string }) => {
    setIntegrationStatus((current) => ({
      ...current,
      cloudflareConnected: true,
      cloudflareAccountName: account.name,
    }));
  }, []);

  const deployDisabled =
    isDeploying ||
    isPlanningResources ||
    (deployOption === 'github-netlify' && (!integrationStatus.githubConnected || !integrationStatus.netlifyConnected)) ||
    (deployOption === 'github-only' && !integrationStatus.githubConnected) ||
    (deployOption === 'cloudflare' && (!integrationStatus.cloudflareConnected || !normalizedCloudflareProjectName)) ||
    ((deployOption === 'github-netlify' || deployOption === 'github-only') &&
      (repoCheck.status === 'taken' || repoCheck.status === 'error' || !repoValidation.valid));

  return {
    isDeployDialogOpen,
    setIsDeployDialogOpen,
    isDeploying,
    deployStatus,
    deployOption,
    setDeployOption,
    repoName,
    setRepoName,
    netlifySiteName,
    setNetlifySiteName,
    cloudflareProjectName,
    setCloudflareProjectName,
    repoVisibility,
    setRepoVisibility,
    githubOrg,
    setGithubOrg,
    githubOrgs,
    integrationStatus,
    repoCheck,
    deployResult,
    deployError,
    deployNotice,
    resourcePlan,
    isPlanningResources,
    linkedRepoFullName,
    linkedRepoName,
    repoMismatch,
    normalizedRepoName,
    normalizedNetlifySiteName,
    normalizedCloudflareProjectName,
    repoValidation,
    startGithubConnect,
    startNetlifyConnect,
    markCloudflareConnected,
    handleDeploy,
    confirmResourcePlan,
    dismissResourcePlan: () => setResourcePlan(null),
    copyToClipboard,
    deployDisabled,
  };
}