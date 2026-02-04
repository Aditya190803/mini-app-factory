'use client';

import { useUser } from "@stackframe/stack";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { 
  Trash2, 
  Settings2, 
  Calendar, 
  Layers, 
  Globe,
  ArrowRight,
  Rocket
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { extractRepoFullNameFromUrl, extractRepoNameFromFullName, normalizeNetlifySiteName, normalizeRepoName, validateRepoName } from "@/lib/deploy-shared";
import { normalizeDeployError, performDeploy } from "@/lib/deploy-client";
import AccountMenu from "@/components/account-menu";

export default function DashboardPage() {
  const user = useUser();
  const router = useRouter();
  const projects = useQuery(api.projects.getUserProjects, { userId: user?.id ?? "" });
  const deleteProject = useMutation(api.projects.deleteProject);
  const saveProject = useMutation(api.projects.saveProject);
  const addDeploymentHistory = useMutation(api.deployments.addDeploymentHistory);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [isRedeployDialogOpen, setIsRedeployDialogOpen] = useState(false);
  const [redeployProject, setRedeployProject] = useState<NonNullable<typeof projects>[number] | null>(null);
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
    redeployProject?._id ? { projectId: redeployProject._id } : "skip"
  );

  const handleDelete = async (projectName: string) => {
    if (!user) return;
    if (confirm(`Are you sure you want to delete "${projectName}"?`)) {
      setIsDeleting(projectName);
      try {
        await deleteProject({ projectName, userId: user.id });
      } catch (error) {
        console.error("Failed to delete project:", error);
        alert("Failed to delete project. Please try again.");
      } finally {
        setIsDeleting(null);
      }
    }
  };

  const linkedRepoFullName = useMemo(
    () => extractRepoFullNameFromUrl(redeployProject?.repoUrl),
    [redeployProject?.repoUrl]
  );
  const linkedRepoName = useMemo(
    () => extractRepoNameFromFullName(linkedRepoFullName),
    [linkedRepoFullName]
  );
  const repoValidation = useMemo(() => validateRepoName(redeployRepoName), [redeployRepoName]);
  const normalizedRepoName = repoValidation.normalized || normalizeRepoName(redeployProject?.projectName ?? "");
  const normalizedNetlifySiteName = useMemo(
    () => normalizeNetlifySiteName(redeployNetlifySiteName || normalizedRepoName),
    [redeployNetlifySiteName, normalizedRepoName]
  );

  useEffect(() => {
    if (!redeployProject) return;
    const provider = redeployProject.deployProvider === 'github' ? 'github-only' : 'github-netlify';
    setRedeployOption(provider);
    setRedeployRepoName(linkedRepoName || redeployProject.projectName);
    setRedeployNetlifySiteName(redeployProject.netlifySiteName || '');
    setRedeployResult(null);
    setRedeployError(null);
  }, [redeployProject, linkedRepoName]);

  useEffect(() => {
    if (!isRedeployDialogOpen) return;
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
  }, [isRedeployDialogOpen]);

  const openRedeploy = (project: NonNullable<typeof projects>[number]) => {
    setRedeployProject(project);
    setIsRedeployDialogOpen(true);
  };

  const startGithubConnect = () => {
    window.location.href = `/api/integrations/github/start?returnTo=${encodeURIComponent('/dashboard')}`;
  };

  const startNetlifyConnect = () => {
    window.location.href = `/api/integrations/netlify/start?returnTo=${encodeURIComponent('/dashboard')}`;
  };

  const handleRedeploy = async () => {
    if (!user || !redeployProject) {
      window.location.href = '/handler/sign-in';
      return;
    }
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
      const data = await performDeploy({
        projectName: redeployProject.projectName,
        prompt: redeployProject.prompt,
        repoVisibility: 'private',
        githubOrg: null,
        deployMode: redeployOption,
        repoName: normalizedRepoName || redeployProject.projectName,
        repoFullName: linkedRepoFullName,
        netlifySiteName: redeployOption === 'github-netlify' ? normalizedNetlifySiteName : undefined,
      }, (status) => {
        setRedeployStatus(status);
      });

      setRedeployResult({
        repoUrl: data.repoUrl,
        deploymentUrl: data.deploymentUrl,
        netlifySiteName: data.netlifySiteName,
      });

      await saveProject({
        projectName: redeployProject.projectName,
        prompt: redeployProject.prompt,
        html: redeployProject.html,
        status: redeployProject.status,
        userId: user.id,
        isPublished: redeployProject.isPublished,
        isMultiPage: redeployProject.isMultiPage,
        pageCount: redeployProject.pageCount,
        description: redeployProject.description,
        selectedModel: redeployProject.selectedModel,
        providerId: redeployProject.providerId,
        deploymentUrl: data.deploymentUrl ?? undefined,
        repoUrl: data.repoUrl ?? undefined,
        deployProvider: redeployOption === 'github-only' ? 'github' : 'netlify',
        deployedAt: Date.now(),
        netlifySiteName: data.netlifySiteName ?? undefined,
      });

      await addDeploymentHistory({
        projectId: redeployProject._id,
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
  };

  if (projects === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--background)' }}>
        <div className="flex flex-col items-center gap-4">
          <div className="w-6 h-6 border-2 border-[var(--primary)] border-t-transparent animate-spin" />
          <div className="text-[10px] font-mono uppercase tracking-[0.2em] animate-pulse" style={{ color: 'var(--muted-text)' }}>
            Retrieving Fabrication Units...
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Unauthorized</h1>
          <p className="text-xs mt-2" style={{ color: 'var(--secondary-text)' }}>
            Please sign in to view your dashboard.
          </p>
          <button
            onClick={() => router.push('/handler/sign-in')}
            className="mt-4 px-4 py-2 text-[10px] font-mono uppercase border border-[var(--border)] text-[var(--primary)] hover:border-[var(--primary)]"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--background)' }}>
      {/* Ambient background accent */}
      <div className="fixed top-0 right-0 w-[500px] h-[500px] bg-[var(--primary)] opacity-[0.03] blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-6xl mx-auto w-full px-6 py-8 flex-1">
        <div className="flex items-center justify-between mb-8 relative z-50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="w-10 h-10 flex items-center justify-center border border-[var(--border)] hover:border-[var(--primary)] text-[var(--secondary-text)] hover:text-[var(--primary)] transition-all"
            >
              ←
            </button>
            <div>
              <h1 className="text-sm font-mono uppercase font-black tracking-[0.4em]" style={{ color: 'var(--foreground)' }}>
                System Dashboard
              </h1>
              <p className="text-[9px] font-mono uppercase tracking-widest mt-1 opacity-50" style={{ color: 'var(--muted-text)' }}>
                Active Production Archive
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 text-[10px] font-mono uppercase bg-[var(--primary)] text-black font-black hover:opacity-90 transition-all"
            >
              + Create New
            </button>
            <AccountMenu />
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="h-[400px] border border-dashed flex flex-col items-center justify-center gap-6 rounded-lg" style={{ borderColor: 'var(--border)' }}>
            <div className="w-16 h-16 border flex items-center justify-center text-3xl opacity-20 rounded-full" style={{ borderColor: 'var(--border)' }}>
              ∅
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-xs font-mono uppercase font-bold tracking-widest text-[var(--foreground)]">
                No Active Fabrications
              </h3>
              <p className="text-[10px] font-mono max-w-xs leading-relaxed text-[var(--muted-text)]">
                Your production queue is currently empty. Initialize a new project from the workshop.
              </p>
            </div>
            <Button
              onClick={() => router.push('/')}
              className="px-6 h-9 font-mono uppercase border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-all font-bold"
              variant="outline"
            >
              Enter Workshop <ArrowRight className="ml-2 w-3 h-3" />
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map((project) => (
              <div
                key={project._id}
                className="group relative flex flex-col bg-[var(--background-surface)] border border-[var(--border)] rounded-sm hover:border-[var(--primary)] transition-all duration-300"
              >
                <div className="p-5 flex-1">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-1">
                      <h2 className="text-sm font-mono font-black text-[var(--foreground)] tracking-tight group-hover:text-[var(--primary)] transition-colors">
                        {project.projectName.toUpperCase()}
                      </h2>
                    </div>
                  </div>

                  {/* Metrics Grid */}
                  <div className="grid grid-cols-2 gap-px bg-[var(--border)]/30 border border-[var(--border)]/30 mb-6 overflow-hidden rounded-sm">
                    <div className="bg-[var(--background-surface)] p-3 space-y-1">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Layers className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-mono uppercase">No of Pages</span>
                      </div>
                      <div className="text-[9px] font-mono font-bold text-[var(--secondary-text)]">
                        {project.pageCount || 1} Pages
                      </div>
                    </div>
                    <div className="bg-[var(--background-surface)] p-3 space-y-1">
                      <div className="flex items-center gap-1.5 opacity-50">
                        <Calendar className="w-2.5 h-2.5" />
                        <span className="text-[8px] font-mono uppercase">Last Sync</span>
                      </div>
                      <div className="text-[9px] font-mono font-bold text-[var(--secondary-text)]">
                        {new Date(project.createdAt).toLocaleDateString(undefined, { 
                          year: 'numeric', 
                          month: 'short', 
                          day: 'numeric' 
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    <div className="flex items-center gap-1.5 opacity-50">
                      <Globe className="w-2.5 h-2.5" />
                      <span className="text-[8px] font-mono uppercase">Deployment</span>
                    </div>
                    <div className="text-[9px] font-mono font-bold text-[var(--secondary-text)]">
                      {project.deploymentUrl ? (
                        <>
                          {project.deployProvider ? project.deployProvider.toUpperCase() : 'DEPLOYED'}
                        </>
                      ) : project.isPublished ? (
                        <>HOSTED</>
                      ) : (
                        <>NOT DEPLOYED</>
                      )}
                    </div>
                    {project.deploymentUrl && (
                      <div className="text-[9px] font-mono text-[var(--muted-text)] break-all">
                        {project.deploymentUrl}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      {project.deploymentUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(project.deploymentUrl, '_blank')}
                          className="h-7 px-3 text-[9px] font-mono uppercase border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                        >
                          Open Live
                        </Button>
                      )}
                      {project.repoUrl && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(project.repoUrl, '_blank')}
                          className="h-7 px-3 text-[9px] font-mono uppercase border-[var(--border)] text-[var(--secondary-text)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
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
                      onClick={() => handleDelete(project.projectName)}
                      disabled={isDeleting === project.projectName}
                      className="h-8 flex-1 text-red-500/60 hover:text-red-500 hover:bg-red-500/5 text-[9px] font-mono uppercase px-0"
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
                    onClick={() => openRedeploy(project)}
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
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={isRedeployDialogOpen}
        onOpenChange={(open) => {
          setIsRedeployDialogOpen(open);
          if (!open) {
            setRedeployProject(null);
            setRedeployResult(null);
            setRedeployError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-[520px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight">
              Redeploy {redeployProject?.projectName}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Trigger a fresh deploy directly from the dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Deploy Options</label>
              <button
                type="button"
                onClick={() => setRedeployOption('github-netlify')}
                className={`w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all ${redeployOption === 'github-netlify'
                  ? 'border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]'
                  : 'border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]'
                  }`}
              >
                GitHub + Netlify
              </button>
              <button
                type="button"
                onClick={() => setRedeployOption('github-only')}
                className={`w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all ${redeployOption === 'github-only'
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
                placeholder={redeployProject?.projectName}
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
                  placeholder={normalizedRepoName || redeployProject?.projectName}
                  className="text-xs font-mono bg-[var(--background)] border-[var(--border)] focus-visible:ring-[var(--primary)]"
                />
                <div className="text-[10px] font-mono text-[var(--muted-text)]">
                  Subdomain slug: {normalizedNetlifySiteName || '—'}.
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
              <div className="text-[11px] text-red-500 font-mono whitespace-pre-wrap">
                {redeployError}
              </div>
            )}
            {isRedeploying && redeployStatus && (
              <div className="p-3 border border-[var(--border)] rounded-md bg-[var(--background-overlay)]/30 space-y-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-[var(--primary)] rounded-full animate-pulse" />
                  <span className="text-[10px] font-mono uppercase font-bold text-[var(--secondary-text)] tracking-wider">Redeployment Status</span>
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
              onClick={() => setIsRedeployDialogOpen(false)}
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
    </div>
  );
}
