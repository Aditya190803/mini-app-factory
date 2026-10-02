'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@stackframe/stack';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Button, Callout, Modal, ModalContent, Spinner } from '@/components/kit';
import { resolveTarget } from '@/lib/targets';
import { type ProjectFile, assembleFullPage } from '@/lib/page-builder';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { withAIAdminHeaders, getStoredSelectedModel, setStoredSelectedModel } from '@/lib/ai-admin-client';
import { readApiError } from '@/lib/api-fetch';
import {
  deleteItem,
  duplicateItem,
  languageForPath,
  moveItem,
  renameItem,
  reorderItem,
  validatePath,
  validateSegment,
} from '@/lib/file-operations';
import { useProjectTransform } from '@/hooks/use-project-transform';
import { useEditorDeploy } from '@/hooks/use-editor-deploy';
import { useProjectFiles } from '@/hooks/use-project-files';
import { useFileHistory } from '@/hooks/use-file-history';
import { useEditorShortcuts } from '@/hooks/use-editor-shortcuts';
import { useZipExport } from '@/hooks/use-zip-export';
import { useLivePreview } from '@/hooks/use-live-preview';

import EditorHeader from './editor/editor-header';
import EditorDeployDialog from './editor/editor-deploy-dialog';
import EditorSidebar from './editor/editor-sidebar';
import PreviewPanel from './editor/preview-panel';
import CodePanel from './editor/code-panel';
import FileTree from './editor/file-tree';
import ComponentLibraryDialog from './editor/component-library-dialog';
import QuickOpen from './editor/quick-open';
import HelpDialog from './editor/help-dialog';
import NameDialog, { type NameDialogRequest } from './editor/name-dialog';
import VersionHistoryDialog from './editor/version-history-dialog';

interface EditorWorkspaceProps {
  initialHTML: string;
  initialPrompt: string;
  projectName: string;
  onBack: () => void;
}

const newFileCopy: Record<ProjectFile['fileType'], { label: string; description: string; placeholder: string }> = {
  page: { label: 'Page', description: 'Create a high-level route such as pricing.html.', placeholder: 'about.html' },
  partial: { label: 'Partial', description: 'Create reusable HTML included with <!-- include:filename.html -->.', placeholder: 'navbar.html' },
  style: { label: 'Stylesheet', description: 'Create a CSS file.', placeholder: 'components.css' },
  script: { label: 'Script', description: 'Create a browser JavaScript file.', placeholder: 'analytics.js' },
  worker: { label: 'Cloudflare Worker', description: 'Create the generated application backend entrypoint.', placeholder: '_worker.js' },
  migration: { label: 'D1 Migration', description: 'Create an ordered SQL migration under migrations/.', placeholder: 'migrations/0001_init.sql' },
  config: { label: 'Wrangler Config', description: 'Declare the generated app runtime and resource bindings.', placeholder: 'wrangler.jsonc' },
};

function initialContent(fileType: ProjectFile['fileType'], projectName: string) {
  if (fileType === 'worker') return "export default {\n  async fetch(request, env) {\n    return env.ASSETS.fetch(request);\n  },\n};";
  if (fileType === 'config') {
    return `{\n  "$schema": "node_modules/wrangler/config-schema.json",\n  "name": "${projectName}",\n  "main": "_worker.js",\n  "compatibility_date": "2026-08-09",\n  "assets": { "directory": ".", "binding": "ASSETS" },\n  "observability": { "enabled": true }\n}`;
  }
  return '';
}

/** Below Tailwind's xl breakpoint the panes overlay the editor instead of sitting beside it. */
const OVERLAY_QUERY = '(max-width: 1279px)';

export default function EditorWorkspace({ initialHTML, initialPrompt, projectName, onBack }: EditorWorkspaceProps) {
  const { confirm, confirmDialog } = useConfirm();
  const router = useRouter();
  const user = useUser();
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'split'>('preview');
  const [activeFilePath, setActiveFilePath] = useState('index.html');
  const [selectedElement, setSelectedElement] = useState<{ path: string; html: string; selector?: string } | null>(null);
  const [editorSearchText, setEditorSearchText] = useState('');
  const [transformPrompt, setTransformPrompt] = useState('');
  const [chatMode, setChatMode] = useState<'build' | 'discuss'>('build');
  const [isDiscussing, setIsDiscussing] = useState(false);
  const discussAbort = useRef<AbortController | null>(null);
  const [selectedModel, setSelectedModel] = useState<{ id: string; providerId: string }>({ id: '', providerId: '' });
  const modelHydratedRef = useRef(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [nameRequest, setNameRequest] = useState<NameDialogRequest | null>(null);
  const [isExplorerVisible, setIsExplorerVisible] = useState(false);
  // Closed until we know the viewport: on a phone an open conversation pane covers the preview.
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(false);
  const [panesOverlay, setPanesOverlay] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(OVERLAY_QUERY);
    setPanesOverlay(media.matches);
    setIsRightSidebarVisible(!media.matches);
    const onChange = (event: MediaQueryListEvent) => setPanesOverlay(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const saveProject = useMutation(api.projects.saveProject);
  const publishProject = useMutation(api.projects.publishProject);
  const addDeploymentHistory = useMutation(api.deployments.addDeploymentHistory);
  const projectData = useQuery(api.projects.getProject, { projectName });
  const projectId = projectData?._id;
  const projectMessages = useQuery(api.conversations.listMessages, projectId ? { projectId } : 'skip');
  const appendMessage = useMutation(api.conversations.appendMessage);
  const createVersion = useMutation(api.conversations.createVersion);
  const createRun = useMutation(api.conversations.createRun);
  const appendRunEvent = useMutation(api.conversations.appendRunEvent);
  const finishRun = useMutation(api.conversations.finishRun);
  const restoreVersion = useMutation(api.conversations.restoreVersion);
  const projectVersions = useQuery(api.conversations.listVersions, projectId ? { projectId } : 'skip');
  const firstVersion = useQuery(api.conversations.getFirstVersion, projectId ? { projectId } : 'skip');
  const activeTransformRun = useRef<Id<'generationRuns'> | null>(null);

  const historyReset = useRef<(files: ProjectFile[]) => void>(() => {});
  const {
    files,
    setFiles,
    filesRef,
    saveStatus,
    conflictKind,
    persistFiles,
    flushSave,
    adoptSavedFiles,
    getFilesVersion,
    reloadFromServer,
    overwriteServer,
  } = useProjectFiles({
    projectName,
    initialHTML,
    initialPrompt,
    projectData,
    signedIn: Boolean(user),
    confirm,
    onLoaded: (loaded) => historyReset.current(loaded),
  });
  const { addToHistory, resetHistory, undo, redo, canUndo, canRedo } = useFileHistory(setFiles);
  historyReset.current = resetHistory;

  const isViewer = projectData?.accessRole === 'viewer';
  const isOwner = projectData?.accessRole === 'owner';

  /** Apply an edit made in the editor: show it, record it for undo, and save it. */
  const commitFiles = useCallback((next: ProjectFile[]) => {
    setFiles(next);
    addToHistory(next);
    void persistFiles(next);
  }, [addToHistory, persistFiles, setFiles]);

  const { isDeployingPreview, deployLivePreview, deleteLivePreview } = useLivePreview({
    projectName,
    isOwner,
    previewProjectName: projectData?.cloudflarePreviewProjectName,
    previewExpiresAt: projectData?.cloudflarePreviewExpiresAt,
    confirm,
  });

  const getFiles = useCallback(() => filesRef.current, [filesRef]);
  const { isExporting, exportZip } = useZipExport({ projectName, initialPrompt, getFiles });

  useEffect(() => {
    if (modelHydratedRef.current || projectData === undefined) return;
    const fromProject = projectData?.selectedModel && projectData?.providerId
      ? { id: projectData.selectedModel, providerId: projectData.providerId }
      : getStoredSelectedModel();
    setSelectedModel(fromProject);
    modelHydratedRef.current = true;
  }, [projectData]);

  const handleSelectedModelChange = useCallback((next: { id: string; providerId: string }) => {
    setSelectedModel(next);
    setStoredSelectedModel(next);
    if (!projectData || isViewer) return;
    void saveProject({
      projectName,
      prompt: projectData.prompt || initialPrompt,
      status: projectData.status,
      isPublished: projectData.isPublished ?? false,
      selectedModel: next.id || '',
      providerId: next.providerId || '',
    }).catch(() => { });
  }, [projectData, isViewer, projectName, initialPrompt, saveProject]);

  /** A link clicked inside the preview; the panel checks the message came from its own frame. */
  const handlePreviewNavigate = useCallback((path: string) => {
    const current = filesRef.current;
    if (current.some((f) => f.path === path)) setActiveFilePath(path);
    else if (path === '' && current.some((f) => f.path === 'index.html')) setActiveFilePath('index.html');
  }, [filesRef]);

  const activeFile = useMemo(() => files.find((f) => f.path === activeFilePath) || files[0], [files, activeFilePath]);

  const previewHtml = useMemo(() => {
    if (files.length === 0) return '';
    return assembleFullPage(
      activeFilePath.endsWith('.html') ? activeFilePath : 'index.html',
      files,
      projectName,
      { favicon: projectData?.favicon, globalSeo: projectData?.globalSeo, seoData: projectData?.seoData },
      true
    );
  }, [files, activeFilePath, projectName, projectData?.favicon, projectData?.globalSeo, projectData?.seoData]);

  const deploy = useEditorDeploy({
    projectName,
    initialPrompt,
    files,
    userId: user?.id,
    projectData,
    saveProject,
    publishProject,
    addDeploymentHistory,
    flushSave,
  });

  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleEditorChange = (value: string | undefined) => {
    if (value === undefined) return;
    const nextFiles = files.map((f) => (f.path === activeFilePath ? { ...f, content: value } : f));
    setFiles(nextFiles);
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
    historyTimerRef.current = setTimeout(() => addToHistory(nextFiles), 1000);
  };

  /** Pass `copy` to ask first; the history dialog has already shown a diff, so it does not. */
  const restoreVersionById = useCallback(async (versionId: string, copy?: { title: string; description: string; confirmLabel: string }) => {
    if (!projectId) return;
    if (copy && !(await confirm({ ...copy, destructive: true }))) return;
    try {
      // Keep the current state as a version first, so restoring never loses unsaved work.
      await flushSave().catch(() => undefined);
      await createVersion({ projectId, summary: 'Before restoring an earlier version', filesJson: JSON.stringify(filesRef.current) });
      const restored = await restoreVersion({ projectId, versionId: versionId as Id<'projectVersions'> });
      const restoredFiles = restored.files as ProjectFile[];
      adoptSavedFiles(restoredFiles, restored.filesVersion);
      setFiles(restoredFiles);
      resetHistory(restoredFiles);
      toast.success('Version restored');
    } catch (error) {
      toast.error('Could not restore that version', { description: error instanceof Error ? error.message : undefined });
    }
  }, [adoptSavedFiles, confirm, createVersion, filesRef, flushSave, projectId, resetHistory, restoreVersion, setFiles]);

  const handleReset = () => {
    if (!firstVersion) {
      toast.info('There is no first build to reset to yet.');
      return;
    }
    void restoreVersionById(firstVersion._id, {
      title: 'Reset to the first build?',
      description: 'The project goes back to the files of its first build. Your current files are saved as a version first, so this can be undone from the history.',
      confirmLabel: 'Reset',
    });
  };

  const { isTransforming, transformProgress, runTransform, cancelTransform } = useProjectTransform({
    projectName,
    activeFilePath,
    files,
    setFiles,
    addToHistory,
    adoptSavedFiles,
    flushSave,
    getFilesVersion,
    selectedModel,
    transformPrompt,
    setTransformPrompt,
    selectedElement,
    setSelectedElement,
    onRunStarted: async (prompt) => {
      if (!projectId) return;
      activeTransformRun.current = await createRun({ projectId, kind: 'build', prompt });
      await appendMessage({ projectId, role: 'user', content: prompt, status: 'completed' });
    },
    onRunEvent: async (event) => {
      if (!projectId || !activeTransformRun.current || event.status === 'complete' || event.status === 'error') return;
      const message = 'message' in event && event.message ? event.message : event.status === 'applying' ? `${event.tool}${event.path ? ` → ${event.path}` : ''}` : event.status;
      await appendRunEvent({ projectId, runId: activeTransformRun.current, type: event.status, message, path: 'path' in event ? event.path : undefined });
    },
    onRunCompleted: async (prompt, nextFiles, usage) => {
      if (!projectId) return;
      const messageId = await appendMessage({
        projectId,
        role: 'assistant',
        content: `Implemented: ${prompt}`,
        status: 'completed',
        detailsJson: JSON.stringify({ files: nextFiles.map((file) => file.path) }),
      });
      await createVersion({ projectId, messageId, summary: prompt, filesJson: JSON.stringify(nextFiles) });
      if (activeTransformRun.current) {
        await finishRun({
          projectId,
          runId: activeTransformRun.current,
          status: 'completed',
          ...(usage ? { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, model: usage.model } : {}),
        });
      }
      activeTransformRun.current = null;
    },
    onRunFailed: async (prompt, message) => {
      if (!projectId) return;
      await appendMessage({ projectId, role: 'system', content: `Build failed: ${message}`, status: 'failed', detailsJson: JSON.stringify({ prompt }) });
      if (activeTransformRun.current) await finishRun({ projectId, runId: activeTransformRun.current, status: 'failed', errorCode: 'TRANSFORM_ERROR', errorMessage: message });
      activeTransformRun.current = null;
    },
    onRunCancelled: async () => {
      if (!projectId || !activeTransformRun.current) return;
      await finishRun({ projectId, runId: activeTransformRun.current, status: 'cancelled' });
      activeTransformRun.current = null;
    },
  });

  const runDiscussion = useCallback(async (promptOverride?: string) => {
    const prompt = promptOverride?.trim() || transformPrompt.trim();
    if (!prompt || isDiscussing) return;
    setTransformPrompt('');
    setIsDiscussing(true);
    const controller = new AbortController();
    discussAbort.current = controller;
    try {
      const response = await fetch('/api/discuss', {
        method: 'POST',
        headers: withAIAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ projectName, prompt, modelId: selectedModel.id || undefined, providerId: selectedModel.providerId || undefined }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error((await readApiError(response)).message);
    } catch (error) {
      setTransformPrompt(prompt);
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        toast.error(error instanceof Error ? error.message : 'Discussion failed');
      }
    } finally {
      discussAbort.current = null;
      setIsDiscussing(false);
    }
  }, [isDiscussing, projectName, selectedModel, transformPrompt]);

  // Stop cancels whichever is running. It used to cancel builds only; a discussion kept going.
  const cancelRun = useCallback(() => {
    cancelTransform();
    discussAbort.current?.abort();
  }, [cancelTransform]);

  // Abort an in-flight discussion when leaving the editor.
  useEffect(() => () => discussAbort.current?.abort(), []);

  const requestNewFile = (type: ProjectFile['fileType'], folder: string | null = null) => {
    const copy = newFileCopy[type];
    const defaultName = folder
      ? (type === 'migration' ? '0001_init.sql' : '')
      : type === 'worker' ? '_worker.js' : type === 'migration' ? 'migrations/0001_init.sql' : type === 'config' ? 'wrangler.jsonc' : '';
    setNameRequest({
      title: `New ${copy.label.toLowerCase()}`,
      description: copy.description,
      label: 'Path',
      hint: `For example ${copy.placeholder}`,
      placeholder: copy.placeholder,
      initialValue: defaultName,
      submitLabel: 'Create',
      onSubmit: (value) => {
        let path = folder ? `${folder.replace(/\/+$/, '')}/${value}` : value;
        path = path.replace(/^\/+/, '');
        if (type === 'worker' && path !== '_worker.js') return 'The Cloudflare Worker entrypoint must be _worker.js at the project root.';
        if (type === 'config' && !['wrangler.jsonc', 'wrangler.json'].includes(path)) return 'The Cloudflare configuration must be wrangler.jsonc at the project root.';
        if (type === 'migration' && !path.startsWith('migrations/')) path = `migrations/${path}`;
        const pathError = validatePath(path);
        if (pathError) return pathError;
        const current = filesRef.current;
        if (current.some((f) => f.path === path || f.path.startsWith(`${path}/`))) return 'Something with that path already exists.';
        commitFiles([...current, { path, content: initialContent(type, projectName), language: languageForPath(path), fileType: type }]);
        setActiveFilePath(path);
        return null;
      },
    });
  };

  const requestNewFolder = () => {
    setNameRequest({
      title: 'New folder',
      description: 'Folders group files in the tree. An empty one is kept with a placeholder file.',
      label: 'Folder name',
      placeholder: 'assets',
      submitLabel: 'Create',
      onSubmit: (value) => {
        const error = validateSegment(value);
        if (error) return error;
        const current = filesRef.current;
        if (current.some((f) => f.path === value || f.path.startsWith(`${value}/`))) return 'A file or folder with this name already exists.';
        commitFiles([...current, { path: `${value}/.keep`, content: '', language: 'html', fileType: 'partial' }]);
        return null;
      },
    });
  };

  /** Keep the open file in view when its path changes underneath it. */
  const followRenames = (renamed?: Map<string, string>) => {
    if (!renamed) return;
    setActiveFilePath((current) => renamed.get(current) ?? current);
  };

  const requestRename = (path: string) => {
    const trimmed = path.replace(/\/+$/, '');
    setNameRequest({
      title: 'Rename',
      description: 'References to this path elsewhere in the project are not rewritten for you.',
      label: 'New name',
      initialValue: trimmed.split('/').pop() ?? '',
      submitLabel: 'Rename',
      onSubmit: (value) => {
        const result = renameItem(filesRef.current, trimmed, value);
        if (!result.ok) return result.error;
        commitFiles(result.files);
        followRenames(result.renamed);
        return null;
      },
    });
  };

  const handleDeleteItem = async (path: string, type: 'file' | 'folder') => {
    const prefix = path.endsWith('/') ? path : `${path}/`;
    const contained = type === 'folder' ? filesRef.current.filter((f) => f.path.startsWith(prefix) && !f.path.endsWith('.keep')) : [];
    const ok = await confirm({
      title: `Delete this ${type}?`,
      description: type === 'folder'
        ? 'Deleting a folder deletes everything inside it. Earlier builds stay restorable from the version history.'
        : 'Earlier builds stay restorable from the version history.',
      details: contained.length ? [path, ...contained.slice(0, 12).map((f) => `  ${f.path}`), ...(contained.length > 12 ? [`  and ${contained.length - 12} more`] : [])].join('\n') : path,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    commitFiles(deleteItem(filesRef.current, path, type));
    setActiveFilePath((current) => (current === path || current.startsWith(prefix) ? 'index.html' : current));
  };

  const handleDuplicateItem = (path: string) => {
    const result = duplicateItem(filesRef.current, path);
    if (!result) return;
    commitFiles(result.files);
    setActiveFilePath(result.path);
  };

  const handleMoveItem = (sourcePath: string, destFolderPath: string) => {
    const result = moveItem(filesRef.current, sourcePath, destFolderPath);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    commitFiles(result.files);
    followRenames(result.renamed);
  };

  const handleMoveAndReorder = (sourcePath: string, destFolderPath: string, targetPath: string) => {
    const moved = moveItem(filesRef.current, sourcePath, destFolderPath);
    if (!moved.ok) {
      toast.error(moved.error);
      return;
    }
    commitFiles(reorderItem(moved.files, moved.renamed?.get(sourcePath) ?? sourcePath, targetPath));
    followRenames(moved.renamed);
  };

  const handleReorderFiles = (sourcePath: string, destinationPath: string) => {
    commitFiles(reorderItem(filesRef.current, sourcePath, destinationPath));
  };

  useEditorShortcuts({
    save: () => void persistFiles(filesRef.current),
    toggleExplorer: () => setIsExplorerVisible((visible) => !visible),
    toggleChat: () => setIsRightSidebarVisible((visible) => !visible),
    quickOpen: () => setIsQuickOpenOpen(true),
  });

  // On small screens the panes overlay the editor; Esc closes them.
  useEffect(() => {
    if (!panesOverlay || !(isRightSidebarVisible || isExplorerVisible)) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      setIsRightSidebarVisible(false);
      setIsExplorerVisible(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panesOverlay, isRightSidebarVisible, isExplorerVisible]);

  const handleOpenPreviewInNewTab = () => {
    // Open the tab inside the click: popup blockers reject window.open after an await.
    const tab = window.open('about:blank', '_blank');
    void flushSave()
      .catch(() => toast.error('Could not save latest changes before opening preview.'))
      .finally(() => {
        const url = `/preview/${projectName}`;
        if (tab) tab.location.href = url;
        else window.open(url, '_blank');
      });
  };

  const readOnlyNotice = () => toast.info('You have viewer access, which is read only');
  const buildTarget = resolveTarget(projectData?.target, files);
  const livePreviewUrl = (projectData?.cloudflarePreviewExpiresAt || 0) > Date.now() ? projectData?.cloudflarePreviewUrl : undefined;

  const messages = useMemo(() => [
    ...((projectMessages?.length || 0) === 0
      ? [{ id: 'initial-prompt', role: 'user' as const, content: initialPrompt, status: 'completed' }]
      : []),
    ...(projectMessages || []).map((message) => {
      const linkedVersion = (projectVersions || []).find((version) => version.messageId === message._id);
      let details: { files?: string[]; prompt?: string } = {};
      try {
        details = JSON.parse(message.detailsJson || '{}') as typeof details;
      } catch {
        details = {};
      }
      return {
        id: message._id,
        role: message.role,
        content: message.content,
        status: message.status,
        versionId: linkedVersion?._id,
        files: details.files || [],
        retryPrompt: message.role === 'system' && message.status === 'failed' ? details.prompt : undefined,
      };
    }),
  ], [initialPrompt, projectMessages, projectVersions]);

  const previewPanelProps = {
    onNavigate: handlePreviewNavigate,
    previewHtml,
    files,
    onOpenInNewTab: handleOpenPreviewInNewTab,
    livePreviewUrl,
    isDeployingPreview,
    onDeployLivePreview: deployLivePreview,
    onDeleteLivePreview: deleteLivePreview,
    onAttachToChat: (path: string, html: string, selector?: string) => setSelectedElement({ path, html, selector }),
  };

  return (
    <div className="flex h-dvh flex-col bg-[var(--background)]">
      {confirmDialog}

      <EditorHeader
        projectName={projectName}
        target={buildTarget}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onBack={onBack}
        saveStatus={saveStatus}
        onExport={() => void exportZip()}
        onDeploy={() => (isViewer ? readOnlyNotice() : deploy.setIsDeployDialogOpen(true))}
        isDeploying={deploy.isDeploying}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onHelp={() => setIsHelpDialogOpen(true)}
        onLibrary={() => (isViewer ? readOnlyNotice() : setIsLibraryOpen(true))}
        onSettings={() => router.push(`/edit/${projectName}/settings`)}
        isExplorerVisible={isExplorerVisible}
        onToggleExplorer={() => setIsExplorerVisible((visible) => !visible)}
        isChatVisible={isRightSidebarVisible}
        onToggleChat={() => setIsRightSidebarVisible((visible) => !visible)}
      />

      {isViewer && (
        <p className="border-b border-[var(--rule)] bg-[var(--surface-2)] px-4 py-1.5 text-center text-xs text-[var(--muted-foreground)]">
          Viewer access. Ask the project owner for editor access to make changes or deploy.
        </p>
      )}

      {/* Save conflicts get a bar rather than a toast: the user has to be able to read the two
          recovery options and pick one, and a toast times out while they are still deciding. */}
      {saveStatus === 'conflict' && conflictKind === 'version' && (
        <div className="border-b border-[var(--rule)] px-3 py-2">
          <Callout
            tone="failed"
            title="Someone else saved this project"
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void reloadFromServer()}>Load theirs</Button>
                <Button size="sm" intent="danger" onClick={() => void overwriteServer()}>Keep mine</Button>
              </div>
            }
          >
            Your edits are still here, held locally. Nothing has been lost, and nothing has been written.
          </Callout>
        </div>
      )}

      {saveStatus === 'conflict' && conflictKind === 'error' && (
        <div className="border-b border-[var(--rule)] px-3 py-2">
          <Callout
            tone="failed"
            title="Your changes could not be saved"
            action={<Button size="sm" onClick={() => void persistFiles(filesRef.current)}>Try again</Button>}
          >
            They are still in the editor. Leaving this page would lose them.
          </Callout>
        </div>
      )}

      <ComponentLibraryDialog
        open={isLibraryOpen}
        onOpenChange={setIsLibraryOpen}
        activeFile={activeFile}
        files={files}
        onInsert={(file) => {
          commitFiles([...filesRef.current, file]);
          setActiveFilePath(file.path);
        }}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* On narrow screens the panes overlay the editor, so they get a backdrop that closes them. */}
        {panesOverlay && (isRightSidebarVisible || isExplorerVisible) && (
          <button
            type="button"
            aria-label="Close the side panel"
            className="absolute inset-0 z-[var(--z-sticky)] bg-[oklch(0.14_0.006_62/0.35)]"
            onClick={() => {
              setIsRightSidebarVisible(false);
              setIsExplorerVisible(false);
            }}
          />
        )}

        {/* Panes collapse by unmounting rather than animating width. Animating a layout property
            on a pane containing an iframe and Monaco makes both relayout on every frame. */}
        {isRightSidebarVisible && (
          <div className="flex shrink-0 flex-col overflow-hidden max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-[var(--z-overlay)] max-xl:max-w-[calc(100vw-3rem)] max-xl:shadow-[var(--shadow-lg)]">
            <EditorSidebar
              transformPrompt={transformPrompt}
              setTransformPrompt={setTransformPrompt}
              selectedModel={selectedModel}
              setSelectedModel={handleSelectedModelChange}
              selectedElement={selectedElement}
              setSelectedElement={setSelectedElement}
              runTransform={chatMode === 'build' ? runTransform : runDiscussion}
              isTransforming={isTransforming || isDiscussing}
              transformProgress={transformProgress}
              onCancelTransform={cancelRun}
              mode={chatMode}
              onModeChange={setChatMode}
              filePaths={files.map((file) => file.path)}
              versions={(projectVersions || []).map((version) => ({ id: version._id, summary: version.summary, createdAt: version.createdAt }))}
              messages={messages}
              onOpenHistory={() => setIsHistoryOpen(true)}
              onRestoreVersion={(versionId) =>
                restoreVersionById(versionId, {
                  title: 'Restore this version?',
                  description: 'The project files are replaced with this version. Your current files are saved as a version first, so you can come back to them.',
                  confirmLabel: 'Restore',
                })
              }
            />
          </div>
        )}

        {isExplorerVisible && (
          <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--rule)] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-[var(--z-overlay)] max-lg:shadow-[var(--shadow-lg)]">
            <FileTree
              files={files}
              activeFilePath={activeFilePath}
              onFileSelect={setActiveFilePath}
              onNewFile={(type) => requestNewFile(type)}
              onNewFolder={requestNewFolder}
              onDeleteItem={(path, type) => void handleDeleteItem(path, type)}
              onRenameItem={requestRename}
              onDuplicateItem={handleDuplicateItem}
              onNewFileInFolder={(folder, type) => requestNewFile(type, folder)}
              onMoveItem={handleMoveItem}
              onMoveAndReorder={handleMoveAndReorder}
              onReorderFiles={handleReorderFiles}
            />
          </div>
        )}

        <main id="main" className="flex min-w-0 flex-1 overflow-hidden">
          {activeTab === 'preview' && (
            <PreviewPanel
              {...previewPanelProps}
              onOpenInEditor={(path, html) => {
                setActiveFilePath(path);
                setActiveTab('code');
                if (html) setEditorSearchText(html);
              }}
            />
          )}

          {activeTab === 'code' && activeFile && (
            <CodePanel
              html={activeFile.content}
              language={activeFile.language}
              onChange={handleEditorChange}
              onReset={handleReset}
              searchText={editorSearchText}
            />
          )}

          {activeTab === 'split' && activeFile && (
            <div className="flex min-w-0 flex-1">
              <div className="min-w-0 flex-1 overflow-hidden border-r border-[var(--rule)]">
                <CodePanel html={activeFile.content} language={activeFile.language} onChange={handleEditorChange} onReset={handleReset} />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <PreviewPanel
                  {...previewPanelProps}
                  onOpenInEditor={(path, html) => {
                    setActiveFilePath(path);
                    if (html) setEditorSearchText(html);
                  }}
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <HelpDialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen} />

      {/* Not dismissible while it runs: closing it used to let a second export start. */}
      <Modal open={isExporting}>
        <ModalContent
          size="sm"
          dismissible={false}
          title="Building the export"
          description="Generating a README and bundling every file into a zip. This takes a few seconds."
        >
          <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]" role="status">
            <Spinner />
            Packaging the project
          </div>
        </ModalContent>
      </Modal>

      <EditorDeployDialog projectName={projectName} deploy={deploy} target={buildTarget} />

      <NameDialog request={nameRequest} onClose={() => setNameRequest(null)} />

      <VersionHistoryDialog
        open={isHistoryOpen}
        onOpenChange={setIsHistoryOpen}
        projectId={projectId}
        currentFiles={files}
        onRestore={(versionId) => restoreVersionById(versionId)}
      />

      <QuickOpen open={isQuickOpenOpen} onOpenChange={setIsQuickOpenOpen} files={files} onSelect={setActiveFilePath} />
    </div>
  );
}
