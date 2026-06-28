'use client';

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
import { cn } from '@/lib/utils';
import type { useEditorDeploy } from '@/hooks/use-editor-deploy';

type DeployState = ReturnType<typeof useEditorDeploy>;

type Props = {
  projectName: string;
  deploy: DeployState;
};

export default function EditorDeployDialog({ projectName, deploy }: Props) {
  const {
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
    startGithubConnect,
    startNetlifyConnect,
    handleDeploy,
    copyToClipboard,
    deployDisabled,
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
          <div className="grid gap-2">
            <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Deploy Options</label>
            {(
              [
                ['github-netlify', 'GitHub + Netlify (Recommended)'],
                ['github-only', 'GitHub Repo Only'],
                ['maf-hosted', 'Deploy with us (Easiest and fastest)'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setDeployOption(value)}
                className={cn(
                  'w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all',
                  deployOption === value
                    ? 'border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]'
                    : 'border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {deployOption !== 'maf-hosted' && (
            <div className="grid gap-2">
              <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Repo Name</label>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder={projectName}
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

          {deployOption === 'github-netlify' && (
            <div className="grid gap-2">
              <label className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Netlify Site Name</label>
              <Input
                value={netlifySiteName}
                onChange={(e) => setNetlifySiteName(e.target.value)}
                placeholder={normalizedRepoName || projectName}
                className="text-xs font-mono bg-[var(--background)] border-[var(--border)] focus-visible:ring-[var(--primary)]"
              />
              <div className="text-[10px] font-mono text-[var(--muted-text)]">
                Leave blank to reuse the repo name. Subdomain slug: {normalizedNetlifySiteName || '—'}.
              </div>
            </div>
          )}

          {deployOption !== 'maf-hosted' && (
            <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
              <div>
                <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">GitHub</div>
                <div className="text-[11px] text-[var(--muted-text)]">
                  {integrationStatus.githubConnected ? 'Connected' : 'Not connected'}
                </div>
              </div>
              <Button onClick={startGithubConnect} variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]">
                {integrationStatus.githubConnected ? 'Reconnect' : 'Connect'}
              </Button>
            </div>
          )}

          {deployOption === 'github-netlify' && (
            <div className="flex items-center justify-between border border-[var(--border)] rounded-md px-3 py-2">
              <div>
                <div className="text-[11px] font-mono uppercase text-[var(--secondary-text)]">Netlify</div>
                <div className="text-[11px] text-[var(--muted-text)]">
                  {integrationStatus.netlifyConnected ? 'Connected' : 'Not connected'}
                </div>
              </div>
              <Button onClick={startNetlifyConnect} variant="outline" className="font-mono uppercase text-[10px] border-[var(--border)]">
                {integrationStatus.netlifyConnected ? 'Reconnect' : 'Connect'}
              </Button>
            </div>
          )}

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
                    <option key={org} value={org}>
                      {org}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {deployOption === 'github-netlify' && (!integrationStatus.githubConnected || !integrationStatus.netlifyConnected) && (
            <div className="text-[11px] text-amber-500 font-mono">Connect both GitHub and Netlify to enable this deploy option.</div>
          )}
          {deployOption === 'github-only' && !integrationStatus.githubConnected && (
            <div className="text-[11px] text-amber-500 font-mono">Connect GitHub to enable this deploy option.</div>
          )}
          {deployOption === 'maf-hosted' && (
            <div className="text-[11px] text-amber-500 font-mono">We will deploy your project to a hosted URL under Mini App Factory.</div>
          )}

          {deployResult?.repoUrl && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Repo: <span className="text-[var(--primary)]">{deployResult.repoUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="font-mono uppercase text-[10px]" onClick={() => window.open(deployResult.repoUrl, '_blank', 'noopener,noreferrer')}>
                  Open Repo
                </Button>
                <Button variant="outline" className="font-mono uppercase text-[10px]" onClick={() => copyToClipboard(deployResult.repoUrl!, 'Repo URL')}>
                  Copy Link
                </Button>
              </div>
            </div>
          )}
          {deployResult?.deploymentUrl && (
            <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
              <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                Live URL: <span className="text-[var(--primary)]">{deployResult.deploymentUrl}</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" className="font-mono uppercase text-[10px]" onClick={() => window.open(deployResult.deploymentUrl, '_blank', 'noopener,noreferrer')}>
                  Open Live URL
                </Button>
                <Button variant="outline" className="font-mono uppercase text-[10px]" onClick={() => copyToClipboard(deployResult.deploymentUrl!, 'Live URL')}>
                  Copy Link
                </Button>
              </div>
            </div>
          )}
          {deployNotice && <div className="text-[11px] text-[var(--muted-text)] font-mono">{deployNotice}</div>}
          {deployError && <div className="text-[11px] text-red-500 font-mono whitespace-pre-wrap">{deployError}</div>}
          {isDeploying && deployStatus && (
            <div className="p-3 border border-[var(--border)] rounded-md bg-[var(--background-overlay)]/30 space-y-2">
              <div className="text-[12px] font-mono text-[var(--foreground)] pl-4 border-l-2 border-[var(--primary)]/30 py-1">{deployStatus}</div>
            </div>
          )}
        </div>
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={() => setIsDeployDialogOpen(false)} className="flex-1 font-mono uppercase text-[10px]">
            Close
          </Button>
          <Button onClick={handleDeploy} disabled={deployDisabled} className="flex-1 bg-[var(--primary)] font-mono uppercase text-[10px] font-black">
            {isDeploying ? 'Deploying...' : deployOption === 'github-only' ? 'Create Repo' : 'Deploy Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}