'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { DeployProgressIndicator } from './deploy-progress';
import type { useDeployWorkflow } from '@/hooks/use-deploy-workflow';

type DeployWorkflow = ReturnType<typeof useDeployWorkflow>;

interface DeployDialogProps {
  deploy: DeployWorkflow;
}

export function DeployDialog({ deploy }: DeployDialogProps) {
  const {
    isDeployDialogOpen,
    setIsDeployDialogOpen,
    isDeploying,
    deployStatus,
    deployOption,
    setDeployOption,
    deployResult,
    deployError,
    deployNotice,
    integrationStatus,
    githubOrgs,
    githubOrg,
    setGithubOrg,
    repoVisibility,
    setRepoVisibility,
    repoName,
    setRepoName,
    repoCheck,
    netlifySiteName,
    setNetlifySiteName,
    normalizedRepoName,
    normalizedNetlifySiteName,
    linkedRepoFullName,
    repoMismatch,
    linkedRepoName,
    isDeployDisabled,
    handleDeploy,
    startGithubConnect,
    startNetlifyConnect,
    copyToClipboard,
  } = deploy;

  return (
    <Dialog open={isDeployDialogOpen} onOpenChange={setIsDeployDialogOpen}>
      <DialogContent className="sm:max-w-[520px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
        <DialogHeader>
          <DialogTitle className="font-mono uppercase text-sm tracking-tight">Deploy to Netlify</DialogTitle>
          <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
            Connect GitHub and Netlify, then deploy your project with one click.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {/* Deploy option selector */}
          <div className="grid gap-2" role="radiogroup" aria-label="Deploy Options">
            <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Deploy Options</label>
            {(['github-netlify', 'github-only', 'maf-hosted'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={deployOption === opt}
                onClick={() => setDeployOption(opt)}
                className={cn(
                  'w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all',
                  deployOption === opt
                    ? 'border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]'
                    : 'border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]',
                )}
              >
                {opt === 'github-netlify' && 'GitHub + Netlify (Recommended)'}
                {opt === 'github-only' && 'GitHub Repo Only'}
                {opt === 'maf-hosted' && 'Deploy with us (Easiest and fastest)'}
              </button>
            ))}
          </div>

          {/* Repo name */}
          {deployOption !== 'maf-hosted' && (
            <div className="grid gap-2">
              <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Repo Name</label>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="project-name"
                className="text-xs font-mono bg-[var(--background)] border-[var(--border)] focus-visible:ring-[var(--primary)]"
                disabled={!!linkedRepoFullName}
              />
              <div className="text-[10px] font-mono text-[var(--muted-text)]">
                {linkedRepoFullName && `Linked repo: ${linkedRepoFullName}. Repo name locked. `}
                {repoMismatch && `Repo name mismatch: linked repo uses ${linkedRepoName}. `}
                {normalizedRepoName && `Slug: ${normalizedRepoName}. `}
                {repoCheck.status === 'checking' && 'Checking availability...'}
                {repoCheck.status === 'available' && `Available${repoCheck.owner ? ` under ${repoCheck.owner}` : ''}.`}
                {repoCheck.status === 'taken' && 'Name already exists.'}
                {repoCheck.status === 'error' && (repoCheck.message || 'Unable to verify repo name.')}
                {repoCheck.status === 'idle' && 'Leave blank to use the project name.'}
              </div>
            </div>
          )}

          {/* Netlify site name */}
          {deployOption === 'github-netlify' && (
            <div className="grid gap-2">
              <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Netlify Site Name</label>
              <Input
                value={netlifySiteName}
                onChange={(e) => setNetlifySiteName(e.target.value)}
                placeholder={normalizedRepoName || 'project-name'}
                className="text-xs font-mono bg-[var(--background)] border-[var(--border)] focus-visible:ring-[var(--primary)]"
              />
              <div className="text-[10px] font-mono text-[var(--muted-text)]">
                Leave blank to reuse the repo name. Subdomain slug: {normalizedNetlifySiteName || '—'}.
              </div>
            </div>
          )}

          {/* GitHub integration status */}
          {deployOption !== 'maf-hosted' && (
            <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
              <div>
                <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">GitHub</div>
                <div className="text-[11px] text-[var(--muted-text)]">
                  {integrationStatus.githubConnected ? 'Connected' : 'Not connected'}
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
          )}

          {/* Netlify integration status */}
          {deployOption === 'github-netlify' && (
            <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
              <div>
                <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">Netlify</div>
                <div className="text-[11px] text-[var(--muted-text)]">
                  {integrationStatus.netlifyConnected ? 'Connected' : 'Not connected'}
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

          {/* Repo visibility + GitHub owner */}
          {deployOption !== 'maf-hosted' && (
            <>
              <div className="grid gap-2">
                <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Repo Visibility</label>
                <select
                  value={repoVisibility}
                  onChange={(e) => setRepoVisibility(e.target.value as 'private' | 'public')}
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-mono text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                >
                  <option value="private">Private (Recommended)</option>
                  <option value="public">Public</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">GitHub Owner</label>
                <select
                  value={githubOrg}
                  onChange={(e) => setGithubOrg(e.target.value)}
                  className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-mono text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  disabled={!integrationStatus.githubConnected}
                >
                  <option value="personal">Personal Account</option>
                  {githubOrgs.map((org) => (
                    <option key={org} value={org}>{org}</option>
                  ))}
                </select>
                <div className="text-[10px] text-[var(--muted-text)] font-mono">
                  Select an org only if your OAuth app has access to it.
                </div>
              </div>
            </>
          )}

          {/* Warnings */}
          {deployOption === 'github-netlify' && (!integrationStatus.githubConnected || !integrationStatus.netlifyConnected) && (
            <div className="text-[11px] text-amber-500 font-mono">
              Connect both GitHub and Netlify to enable this deploy option.
            </div>
          )}
          {deployOption === 'github-only' && !integrationStatus.githubConnected && (
            <div className="text-[11px] text-amber-500 font-mono">
              Connect GitHub to enable this deploy option.
            </div>
          )}
          {deployOption === 'maf-hosted' && (
            <div className="text-[11px] text-amber-500 font-mono">
              We will deploy your project to a hosted URL under Mini App Factory.
            </div>
          )}

          {/* Deploy results */}
          {deployResult?.repoUrl && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Repo: <span className="text-[var(--primary)]">{deployResult.repoUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]"
                  onClick={() => window.open(deployResult.repoUrl, '_blank')}>Open Repo</Button>
                <Button variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]"
                  onClick={() => copyToClipboard(deployResult.repoUrl!, 'Repo URL')}>Copy Link</Button>
              </div>
            </div>
          )}
          {deployResult?.deploymentUrl && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Live URL: <span className="text-[var(--primary)]">{deployResult.deploymentUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]"
                  onClick={() => window.open(deployResult.deploymentUrl, '_blank')}>Open Live URL</Button>
                <Button variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]"
                  onClick={() => copyToClipboard(deployResult.deploymentUrl!, 'Live URL')}>Copy Link</Button>
              </div>
            </div>
          )}
          {deployResult?.netlifySiteName && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Netlify Site: <span className="text-[var(--primary)]">{deployResult.netlifySiteName}</span>
              </div>
              <Button variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]"
                onClick={() => copyToClipboard(deployResult.netlifySiteName!, 'Netlify Site Name')}>Copy Name</Button>
            </div>
          )}

          {/* Notices and errors */}
          {deployNotice && (
            <div className="text-[11px] text-[var(--muted-text)] font-mono">{deployNotice}</div>
          )}
          {deployError && (
            <div className="text-[11px] text-red-500 font-mono whitespace-pre-wrap">{deployError}</div>
          )}
          {isDeploying && deployStatus && (
            <DeployProgressIndicator
              statusMessage={deployStatus}
              isDeploying={isDeploying}
              deployOption={deployOption}
            />
          )}
        </div>
        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsDeployDialogOpen(false)}
            className="flex-1 font-mono uppercase text-[10px] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background-overlay)]"
          >
            Close
          </Button>
          <Button
            onClick={handleDeploy}
            disabled={isDeployDisabled}
            className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
          >
            {isDeploying ? 'Deploying...' : deployOption === 'github-only' ? 'Create Repo' : 'Deploy Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
