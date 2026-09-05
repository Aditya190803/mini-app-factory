'use client'

import * as React from 'react'
import {
  ArrowLeft,
  Cloud,
  Code2,
  Columns2,
  Download,
  HelpCircle,
  Library,
  MessageSquare,
  Monitor,
  PanelLeft,
  Redo2,
  Settings,
  Undo2,
} from 'lucide-react'
import {
  Badge,
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Segmented,
  StatusDot,
  Toolbar,
  Tooltip,
} from '@/components/kit'
import { TARGETS, type BuildTarget } from '@/lib/targets'
import { cn } from '@/lib/utils'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict'

type Props = {
  projectName: string
  target: BuildTarget
  activeTab: 'preview' | 'code' | 'split'
  setActiveTab: (tab: 'preview' | 'code' | 'split') => void
  onBack: () => void
  saveStatus: SaveStatus
  onExport: () => void
  onDeploy: () => void
  isDeploying: boolean
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onHelp: () => void
  onLibrary: () => void
  onSettings: () => void
  isExplorerVisible: boolean
  onToggleExplorer: () => void
  isChatVisible: boolean
  onToggleChat: () => void
}

const SAVE_COPY: Record<SaveStatus, { label: string; tone: 'neutral' | 'live' | 'pending' | 'failed' }> = {
  idle: { label: 'Ready', tone: 'neutral' },
  saving: { label: 'Saving', tone: 'pending' },
  saved: { label: 'Saved', tone: 'live' },
  // The danger here is someone carrying on editing while believing their work
  // is stored, so the copy says outright that it is not.
  conflict: { label: 'Not saved', tone: 'failed' },
}

/**
 * The editor toolbar.
 *
 * Deploy is the only primary button on this surface, and it goes to Cloudflare.
 * Everything else that can leave the editor (export a zip, open settings, the
 * component library) lives behind one overflow menu, which is what keeps the
 * bar from turning into the fourteen-icon strip it used to be.
 */
export default function EditorHeader({
  projectName,
  target,
  activeTab,
  setActiveTab,
  onBack,
  saveStatus,
  onExport,
  onDeploy,
  isDeploying,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onHelp,
  onLibrary,
  onSettings,
  isExplorerVisible,
  onToggleExplorer,
  isChatVisible,
  onToggleChat,
}: Props) {
  const save = SAVE_COPY[saveStatus]

  return (
    <Toolbar className="z-[var(--z-raised)] gap-1.5 px-2 sm:px-3">
      <IconButton label="Back to projects" onClick={onBack} size="sm">
        <ArrowLeft className="size-4" />
      </IconButton>

      <div className="hidden min-w-0 sm:block">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-sm font-medium tracking-[-0.02em]">
            {projectName}
          </span>
          <Tooltip content={TARGETS[target].summary}>
            <span>
              <Badge tone={target === 'edge' ? 'signal' : 'neutral'} mono>
                {target}
              </Badge>
            </span>
          </Tooltip>
        </div>
      </div>

      <div className="mx-1 hidden h-5 w-px bg-[var(--rule)] sm:block" />

      <span
        className={cn(
          'flex shrink-0 items-center gap-1.5 text-xs',
          saveStatus === 'conflict'
            ? 'font-medium text-[var(--destructive-text)]'
            : 'text-[var(--muted-foreground)]'
        )}
      >
        <StatusDot tone={save.tone} />
        <span className="hidden md:inline">{save.label}</span>
      </span>

      <div className="flex-1" />

      <Segmented
        label="Workspace view"
        value={activeTab}
        onChange={setActiveTab}
        size="sm"
        options={[
          { value: 'preview', label: <span className="hidden md:inline">Preview</span>, icon: <Monitor className="size-3.5" />, title: 'Preview' },
          { value: 'code', label: <span className="hidden md:inline">Code</span>, icon: <Code2 className="size-3.5" />, title: 'Code' },
          { value: 'split', label: <span className="hidden md:inline">Split</span>, icon: <Columns2 className="size-3.5" />, title: 'Split' },
        ]}
      />

      <div className="flex-1" />

      <IconButton
        label={isChatVisible ? 'Hide the conversation' : 'Show the conversation'}
        aria-pressed={isChatVisible}
        on={isChatVisible}
        size="sm"
        onClick={onToggleChat}
      >
        <MessageSquare className="size-4" />
      </IconButton>
      <IconButton
        label={isExplorerVisible ? 'Hide the file tree' : 'Show the file tree'}
        aria-pressed={isExplorerVisible}
        on={isExplorerVisible}
        size="sm"
        onClick={onToggleExplorer}
      >
        <PanelLeft className="size-4" />
      </IconButton>

      <div className="mx-0.5 hidden h-5 w-px bg-[var(--rule)] lg:block" />

      <IconButton label="Undo" size="sm" disabled={!canUndo} onClick={onUndo} className="hidden lg:grid">
        <Undo2 className="size-4" />
      </IconButton>
      <IconButton label="Redo" size="sm" disabled={!canRedo} onClick={onRedo} className="hidden lg:grid">
        <Redo2 className="size-4" />
      </IconButton>

      <Menu>
        <MenuTrigger asChild>
          <IconButton label="More project actions" size="sm">
            <Settings className="size-4" />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={onSettings}>
            <Settings />
            Project settings
          </MenuItem>
          <MenuItem onSelect={onLibrary}>
            <Library />
            Component library
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onExport}>
            <Download />
            Export as zip
          </MenuItem>
          <MenuSeparator />
          <MenuItem onSelect={onHelp}>
            <HelpCircle />
            Shortcuts and tips
          </MenuItem>
        </MenuContent>
      </Menu>

      <Button intent="primary" size="sm" onClick={onDeploy} busy={isDeploying} className="ml-1">
        <Cloud className="size-3.5" />
        Deploy
      </Button>
    </Toolbar>
  )
}
