'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { ProjectFile } from '@/lib/page-builder';
import {
  extractNetlifySiteNameFromUrl,
  extractRepoFullNameFromUrl,
  extractRepoNameFromFullName,
  normalizeNetlifySiteName,
  normalizeRepoName,
  validateRepoName,
} from '@/lib/deploy-shared';
import { normalizeDeployError, performDeploy } from '@/lib/deploy-client';

export type DeployOption = 'github-netlify' | 'github-only' | 'maf-hosted';

type ProjectDeployMeta = {
  _id?: string;
  repoUrl?: string | null;
  deploymentUrl?: string | null;
  netlifySiteName?: string | null;
  isPublished?: boolean;
};

type UseEditorDeployArgs = {
  projectName: string;
  initialPrompt: string;
  files: ProjectFile[];
  previewHtml: string;
  userId: string | undefined;
  projectData: ProjectDeployMeta | null | undefined;
  // ponytail: Convex useMutation types are wide; workspace passes real mutations
  saveProject: (args: object) => Promise<unknown>;
  publishProject: (args: { projectName: string; userId: string }) => Promise<unknown>;
  addDeploymentHistory: (args: object) => Promise<unknown>;
};

export function useEditorDeploy(args: UseEditorDeployArgs) {
  const {
    projectName,
    initialPrompt,
    files,
    previewHtml,
    userId,
    projectData,
    saveProject,
    publishProject,
    addDeploymentHistory,
  } = args;

  const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState({ githubConnected: false, netlifyConnected: false });
  const [githubOrgs, setGithubOrgs] = useState<string[]>([]);
  const [githubOrg, setGithubOrg] = useState('personal');
  const [repoVisibility, setRepoVisibility] = useState<'private' | 'public'>('private');
  const [deployOption, setDeployOption] = useState<DeployOption>('github-netlify');
  const [repoName, setRepoName] = useState(projectName);
  const [netlifySiteName, setNetlifySiteName] = useState('');
  const [repoCheck, setRepoCheck] = useState<{
    status: 'idle' | 'checking' | 'available' | 'taken' | 'error';
    owner?: string;
    message?: string;
  }>({ status: 'idle' });
  const [deployResult, setDeployResult] = useState<{
    repoUrl?: string;
    deploymentUrl?: string;
    netlifySiteName?: string;
  } | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployNotice, setDeployNotice] = useState<string | null>(null);
  const lastProjectNameRef = useRef(projectName);

  const repoValidation = useMemo(() => validateRepoName(repoName), [repoName]);
  const normalizedRepoName = repoValidation.normalized || normalizeRepoName(projectName);
  const normalizedNetlifySiteName = useMemo(
    () => normalizeNetlifySiteName(netlifySiteName || normalizedRepoName),
    [netlifySiteName, normalizedRepoName]
  );
  const linkedRepoFullName = useMemo(() => extractRepoFullNameFromUrl(projectData?.repoUrl), [projectData?.repoUrl]);
  const linkedRepoName = useMemo(() => extractRepoNameFromFullName(linkedRepoFullName), [linkedRepoFullName]);
  const repoMismatch = useMemo(
    () => !!(linkedRepoName && normalizedRepoName && linkedRepoName !== normalizedRepoName),
    [linkedRepoName, normalizedRepoName]
  );

  const fetchIntegrationStatus = useCallback(async () => {
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
    } catch {
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
    if (!deployNotice) return;
    const timer = window.setTimeout(() => setDeployNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [deployNotice]);

  useEffect(() => {
    setDeployResult((prev) => (prev?.repoUrl || prev?.deploymentUrl || prev?.netlifySiteName ? prev : null));
    setDeployError(null);
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
    if (deployOption === 'maf-hosted') return;
    if (!integrationStatus.githubConnected) return;
    if (projectData?.repoUrl) {
      setRepoCheck({ status: 'available', message: 'Linked repo will be reused.' });
      return;
    }

    const handle = window.setTimeout(async () => {
      setRepoCheck({ status: 'checking' });
      try {
        const ownerParam = githubOrg === 'personal' ? '' : `&owner=${encodeURIComponent(githubOrg)}`;
        const resp = await fetch(
          `/api/integrations/github/check-repo?name=${encodeURIComponent(normalizedRepoName)}${ownerParam}`
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
      } catch {
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
        html: previewHtml,
        status: 'completed',
        userId,
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
    [userId, saveProject, projectName, initialPrompt, previewHtml, projectData?.isPublished, files]
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
      await publishProject({ projectName, userId });
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

  const handleDeploy = useCallback(async () => {
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
        },
        (status) => setDeployStatus(status)
      );
      setDeployResult({
        repoUrl: data.repoUrl,
        deploymentUrl: data.deploymentUrl,
        netlifySiteName: data.netlifySiteName,
      });
      await persistDeployMeta({
        deploymentUrl: data.deploymentUrl ?? undefined,
        repoUrl: data.repoUrl ?? undefined,
        deployProvider: deployOption === 'github-only' ? 'github' : 'netlify',
        netlifySiteName: data.netlifySiteName ?? extractNetlifySiteNameFromUrl(data.deploymentUrl) ?? undefined,
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
    persistDeployMeta,
    projectData?._id,
    addDeploymentHistory,
    fetchIntegrationStatus,
  ]);

  const deployDisabled =
    isDeploying ||
    (deployOption === 'github-netlify' && (!integrationStatus.githubConnected || !integrationStatus.netlifyConnected)) ||
    (deployOption === 'github-only' && !integrationStatus.githubConnected) ||
    (deployOption !== 'maf-hosted' &&
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
    linkedRepoFullName,
    linkedRepoName,
    repoMismatch,
    normalizedRepoName,
    normalizedNetlifySiteName,
    repoValidation,
    startGithubConnect,
    startNetlifyConnect,
    handleDeploy,
    copyToClipboard,
    deployDisabled,
  };
}