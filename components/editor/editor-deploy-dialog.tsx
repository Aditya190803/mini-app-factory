'use client'

import * as React from 'react'
import { AlertTriangle, Check, Cloud, ExternalLink } from 'lucide-react'
import type { useEditorDeploy } from '@/hooks/use-editor-deploy'
import {
  Badge,
  Button,
  Callout,
  CopyValue,
  Field,
  Input,
  Modal,
  ModalContent,
  Select,
  StatusDot,
} from '@/components/kit'
import CloudflareConnect from '@/components/cloudflare-connect'
import { DEPLOY_SURFACES, TARGETS, type BuildTarget } from '@/lib/targets'
import { cn } from '@/lib/utils'

type DeployState = ReturnType<typeof useEditorDeploy>

type Props = {
  projectName: string
  deploy: DeployState
  target: BuildTarget
}

/**
 * The deploy flow.
 *
 * Cloudflare is first and is the default, and it is the only surface that can
 * host both targets. The rest are shown for what they are: a factory-hosted
 * preview that only handles static output, and mirrors that push the same
 * bundle somewhere without hosting it.
 *
 * Any surface that can create persistent or billable resources is marked, and
 * the plan gate is a hard stop: the exact list of resources, each labelled
 * create or reuse, has to be approved before the deploy runs. That is the one
 * confirmation this product does not let you skip.
 */
export default function EditorDeployDialog({ projectName, deploy, target }: Props) {
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
    startGithubConnect,
    startNetlifyConnect,
    markCloudflareConnected,
    handleDeploy,
    confirmResourcePlan,
    dismissResourcePlan,
    deployDisabled,
  } = deploy

  const isGithubDeploy = deployOption === 'github-netlify' || deployOption === 'github-only'

  // The in-app preview cannot run a Worker, so it is not offered to an edge
  // app at all rather than being offered and then failing.
  const surfaces = DEPLOY_SURFACES.filter(
    (surface) => surface.id !== 'cloudflare-preview' && surface.supports.includes(target)
  )

  const connected = (need: 'cloudflare' | 'github' | 'netlify') =>
    need === 'cloudflare'
      ? integrationStatus.cloudflareConnected
      : need === 'github'
        ? integrationStatus.githubConnected
        : integrationStatus.netlifyConnected

  const createCount = resourcePlan?.filter((item) => item.action === 'create').length ?? 0

  return (
    <Modal open={isDeployDialogOpen} onOpenChange={setIsDeployDialogOpen}>
      <ModalContent
        size="lg"
        title="Deploy"
        description={`This project is ${
          target === 'edge' ? 'an edge app' : 'a static site'
        }. ${TARGETS[target].provisions}`}
        footer={
          <>
            <Button onClick={() => setIsDeployDialogOpen(false)}>Close</Button>
            <Button
              intent={resourcePlan && createCount > 0 ? 'danger' : 'primary'}
              busy={isDeploying || isPlanningResources}
              disabled={deployDisabled}
              onClick={resourcePlan ? confirmResourcePlan : handleDeploy}
            >
              <Cloud className="size-4" />
              {resourcePlan
                ? createCount > 0
                  ? `Create ${createCount} and deploy`
                  : 'Deploy'
                : deployOption === 'github-only'
                  ? 'Push to the repo'
                  : 'Deploy'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <fieldset>
            <legend className="key mb-2">Where it goes</legend>
            <div className="space-y-1.5">
              {surfaces.map((surface) => {
                const active = deployOption === surface.id
                const missing = surface.requires.filter((need) => !connected(need))
                return (
                  <label
                    key={surface.id}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-3',
                      'transition-colors duration-[var(--dur-1)]',
                      active
                        ? 'border-[color-mix(in_oklab,var(--primary)_50%,transparent)] bg-[var(--signal-wash)]'
                        : 'border-[var(--rule)] hover:border-[var(--rule-strong)]'
                    )}
                  >
                    <input
                      type="radio"
                      name="deploy-surface"
                      checked={active}
                      onChange={() => setDeployOption(surface.id as typeof deployOption)}
                      className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{surface.label}</span>
                        {surface.primary && (
                          <Badge tone="signal" mono>
                            recommended
                          </Badge>
                        )}
                        {surface.provisions && <Badge tone="warning">creates resources</Badge>}
                        {missing.length > 0 && (
                          <Badge tone="neutral">
                            connect {missing.join(' and ')}
                          </Badge>
                        )}
                      </span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--muted-foreground)]">
                        {surface.detail}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>

          {deployOption === 'cloudflare' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--rule)] p-3">
                <CloudflareConnect
                  connected={integrationStatus.cloudflareConnected}
                  accountName={integrationStatus.cloudflareAccountName}
                  onConnected={markCloudflareConnected}
                />
              </div>

              <Field
                label="Pages project name"
                hint={`Published at https://${normalizedCloudflareProjectName || 'project'}.pages.dev`}
              >
                <Input
                  value={cloudflareProjectName}
                  onChange={(event) => setCloudflareProjectName(event.target.value)}
                  placeholder={projectName}
                  className="font-mono"
                  disabled={Boolean(deployResult?.cloudflareProjectName)}
                />
              </Field>
            </div>
          )}

          {isGithubDeploy && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rule)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <StatusDot tone={integrationStatus.githubConnected ? 'live' : 'pending'} />
                    GitHub
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {integrationStatus.githubConnected ? 'Connected' : 'Not connected yet'}
                  </p>
                </div>
                <Button size="sm" onClick={startGithubConnect}>
                  {integrationStatus.githubConnected ? 'Reconnect' : 'Connect'}
                </Button>
              </div>

              <Field
                label="Repository name"
                error={repoCheck.status === 'taken' ? 'That name already exists.' : undefined}
                hint={
                  linkedRepoFullName
                    ? `Already linked to ${linkedRepoFullName}, so the name is fixed.`
                    : repoMismatch
                      ? `The linked repo uses ${linkedRepoName}.`
                      : repoCheck.status === 'checking'
                        ? 'Checking availability'
                        : repoCheck.status === 'available'
                          ? `Available${repoCheck.owner ? ` under ${repoCheck.owner}` : ''}.`
                          : repoCheck.status === 'error'
                            ? repoCheck.message || 'Could not verify that name.'
                            : `Pushed as ${normalizedRepoName || projectName}.`
                }
              >
                <Input
                  value={repoName}
                  onChange={(event) => setRepoName(event.target.value)}
                  placeholder={projectName}
                  className="font-mono"
                  disabled={Boolean(linkedRepoFullName)}
                />
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Visibility">
                  <Select
                    value={repoVisibility}
                    onChange={(event) =>
                      setRepoVisibility(event.target.value as 'private' | 'public')
                    }
                  >
                    <option value="private">Private</option>
                    <option value="public">Public</option>
                  </Select>
                </Field>
                <Field label="Owner" disabled={!integrationStatus.githubConnected}>
                  <Select
                    value={githubOrg}
                    onChange={(event) => setGithubOrg(event.target.value)}
                    disabled={!integrationStatus.githubConnected}
                  >
                    <option value="personal">Your personal account</option>
                    {githubOrgs.map((org) => (
                      <option key={org} value={org}>
                        {org}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          )}

          {deployOption === 'github-netlify' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--rule)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <StatusDot tone={integrationStatus.netlifyConnected ? 'live' : 'pending'} />
                    Netlify
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
                    {integrationStatus.netlifyConnected ? 'Connected' : 'Not connected yet'}
                  </p>
                </div>
                <Button size="sm" onClick={startNetlifyConnect}>
                  {integrationStatus.netlifyConnected ? 'Reconnect' : 'Connect'}
                </Button>
              </div>

              <Field
                label="Netlify site name"
                optional
                hint={`Subdomain: ${normalizedNetlifySiteName || 'reuses the repo name'}`}
              >
                <Input
                  value={netlifySiteName}
                  onChange={(event) => setNetlifySiteName(event.target.value)}
                  placeholder={normalizedRepoName || projectName}
                  className="font-mono"
                />
              </Field>
            </div>
          )}

          {/* The gate. Nothing is created until this is approved. */}
          {resourcePlan && (
            <Callout
              tone={createCount > 0 ? 'warning' : 'info'}
              icon={<AlertTriangle className="size-4" />}
              title={
                createCount > 0
                  ? `${createCount} Cloudflare resource${createCount === 1 ? '' : 's'} will be created`
                  : 'No new resources. Everything is reused.'
              }
              action={
                <Button size="sm" onClick={dismissResourcePlan}>
                  Cancel
                </Button>
              }
            >
              <ul className="mt-1 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
                {resourcePlan.map((item) => (
                  <li
                    key={`${item.kind}:${item.binding}`}
                    className="flex items-center justify-between gap-3 py-1.5 font-mono text-xs"
                  >
                    <span className="min-w-0 truncate">
                      <span className="text-[var(--foreground)]">{item.binding}</span>
                      <span className="text-[var(--muted-foreground)]"> to {item.name}</span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0',
                        item.action === 'create'
                          ? 'text-[var(--warning-text)]'
                          : 'text-[var(--muted-foreground)]'
                      )}
                    >
                      {item.action}
                    </span>
                  </li>
                ))}
              </ul>
            </Callout>
          )}

          {deployResult?.deploymentUrl && (
            <Callout
              tone="live"
              icon={<Check className="size-4" />}
              title="Deployed"
              action={
                <Button size="sm" asChild>
                  <a href={deployResult.deploymentUrl} target="_blank" rel="noopener noreferrer">
                    Open
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              }
            >
              <CopyValue value={deployResult.deploymentUrl} label="the live URL" />
            </Callout>
          )}

          {deployResult?.repoUrl && (
            <Callout
              tone="neutral"
              title="Repository"
              action={
                <Button size="sm" asChild>
                  <a href={deployResult.repoUrl} target="_blank" rel="noopener noreferrer">
                    Open
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              }
            >
              <CopyValue value={deployResult.repoUrl} label="the repo URL" />
            </Callout>
          )}

          {deployError && (
            <Callout tone="failed" title="The deploy failed">
              <p className="whitespace-pre-wrap font-mono text-xs">{deployError}</p>
            </Callout>
          )}

          {deployNotice && (
            <p aria-live="polite" className="text-xs text-[var(--muted-foreground)]">
              {deployNotice}
            </p>
          )}

          {isDeploying && deployStatus && (
            <p aria-live="polite" className="font-mono text-xs text-[var(--muted-foreground)]">
              {deployStatus}
            </p>
          )}
        </div>
      </ModalContent>
    </Modal>
  )
}
