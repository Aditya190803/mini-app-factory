'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useUser } from "@stackframe/stack";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from '@/convex/_generated/dataModel';
import {
  Button,
  Callout,
  Field,
  IconButton,
  Input,
  Kbd,
  Modal,
  ModalContent,
  SpecTable,
  Spinner,
  Textarea,
} from '@/components/kit';
import { Search, X } from 'lucide-react';
import { resolveTarget } from '@/lib/targets';
import { ProjectFile, assembleFullPage } from '@/lib/page-builder';
import { migrateProject } from '@/lib/migration';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { withAIAdminHeaders, getStoredSelectedModel, setStoredSelectedModel } from '@/lib/ai-admin-client';
import { useProjectTransform } from '@/hooks/use-project-transform';
import { useEditorDeploy } from '@/hooks/use-editor-deploy';

import EditorHeader from './editor/editor-header';
import EditorDeployDialog from './editor/editor-deploy-dialog';
import EditorSidebar from './editor/editor-sidebar';
import PreviewPanel from './editor/preview-panel';
import CodePanel from './editor/code-panel';
import FileTree from './editor/file-tree';
import ComponentLibraryDialog from './editor/component-library-dialog';

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

export default function EditorWorkspace({ initialHTML, initialPrompt, projectName, onBack }: EditorWorkspaceProps) {
  const { confirm, confirmDialog } = useConfirm();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'split'>('preview');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('index.html');
  const [selectedElement, setSelectedElement] = useState<{ path: string, html: string, selector?: string } | null>(null);
  const [editorSearchText, setEditorSearchText] = useState<string>('');
  const [transformPrompt, setTransformPrompt] = useState('');
  const [chatMode, setChatMode] = useState<'build' | 'discuss'>('build');
  const [isDiscussing, setIsDiscussing] = useState(false);
  const [isDeployingPreview, setIsDeployingPreview] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ id: string, providerId: string }>({ id: '', providerId: '' });
  const modelHydratedRef = useRef(false);
  const [isExporting, setIsExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict'>('idle');
  const [conflictKind, setConflictKind] = useState<'version' | 'error' | null>(null);
  /**
   * The filesVersion the in-memory `files` snapshot was built from.
   *
   * Sent with every save so a write built on stale state is rejected rather than applied —
   * saveFiles deletes any path missing from its input, so an overwrite is destructive, and now
   * that projects can have collaborators the other writer may be another person.
   *
   * Deliberately a ref, not derived from projectData: projectData.filesVersion is live and would
   * always match, which would make the check pass in exactly the case it exists to catch.
   */
  const filesVersionRef = useRef<number | null>(null);
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<ProjectFile[] | null>(null);
  const [isPolishDialogOpen, setIsPolishDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isNewFileDialogOpen, setIsNewFileDialogOpen] = useState(false);
  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [newFileType, setNewFileType] = useState<ProjectFile['fileType']>('page');
  const [newFileName, setNewFileName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [newFileInFolderPath, setNewFileInFolderPath] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ path: string, type: 'file' | 'folder' } | null>(null);
  const [polishDescription, setPolishDescription] = useState('typography, animations, mobile responsiveness');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isExplorerVisible, setIsExplorerVisible] = useState(false);
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(true);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [quickOpenSearch, setQuickOpenSearch] = useState('');
  const [quickOpenIndex, setQuickOpenIndex] = useState(0);
  const quickOpenListRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<ProjectFile[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const user = useUser();
  const saveProject = useMutation(api.projects.saveProject);
  const saveFilesAction = useMutation(api.files.saveFiles);
  const migrateLegacyFilesAction = useMutation(api.files.migrateLegacyFiles);
  const publishProject = useMutation(api.projects.publishProject);
  const addDeploymentHistory = useMutation(api.deployments.addDeploymentHistory);
  const projectData = useQuery(api.projects.getProject, { projectName });
  const projectFiles = useQuery(api.files.getFilesByProject, 
    projectData?._id ? { projectId: projectData._id } : "skip"
  );
  const projectMessages = useQuery(api.conversations.listMessages,
    projectData?._id ? { projectId: projectData._id } : 'skip'
  );
  const appendMessage = useMutation(api.conversations.appendMessage);
  const createVersion = useMutation(api.conversations.createVersion);
  const createRun = useMutation(api.conversations.createRun);
  const appendRunEvent = useMutation(api.conversations.appendRunEvent);
  const finishRun = useMutation(api.conversations.finishRun);
  const restoreVersion = useMutation(api.conversations.restoreVersion);
  const projectVersions = useQuery(api.conversations.listVersions,
    projectData?._id ? { projectId: projectData._id } : 'skip'
  );
  const activeTransformRun = useRef<Id<'generationRuns'> | null>(null);
  const previewCleanupStarted = useRef(false);

  useEffect(() => {
    if (previewCleanupStarted.current || !projectData?.cloudflarePreviewProjectName || (projectData.cloudflarePreviewExpiresAt || 0) > Date.now()) return;
    previewCleanupStarted.current = true;
    void fetch('/api/cloudflare/preview', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName }),
    }).then((response) => {
      if (!response.ok) previewCleanupStarted.current = false;
    }).catch(() => { previewCleanupStarted.current = false; });
  }, [projectData?.cloudflarePreviewExpiresAt, projectData?.cloudflarePreviewProjectName, projectName]);

  const addToHistory = useCallback((currentFiles: ProjectFile[]) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push([...currentFiles]);
      if (next.length > 50) next.shift();
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const prevFiles = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setFiles(prevFiles);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextFiles = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setFiles(nextFiles);
    }
  };

  useEffect(() => {
    if (projectFiles && !hasLoaded) {
      let loadedFiles: ProjectFile[] = [];
      if (projectFiles.length > 0) {
        loadedFiles = (projectFiles as Array<{ path: string; content: string; language: string; fileType: string }>).map(f => ({
          path: f.path,
          content: f.content,
          language: f.language as ProjectFile['language'],
          fileType: f.fileType as ProjectFile['fileType']
        }));
        // Anchor optimistic concurrency to the version these files came from.
        filesVersionRef.current = projectData?.filesVersion ?? 0;
      } else if (initialHTML) {
        loadedFiles = migrateProject(initialHTML);

        // Hand the migration to Convex rather than writing it through saveFiles. An empty
        // projectFiles read is indistinguishable from one that has not propagated yet, and
        // saveFiles deletes any path missing from its input — so racing a just-finished
        // generation used to replace every generated page with the legacy blob's few files.
        // migrateLegacyFiles re-checks emptiness inside the transaction and only ever inserts.
        if (projectData?._id) {
          migrateLegacyFilesAction({
            projectId: projectData._id,
            files: loadedFiles
          }).then((result) => {
            filesVersionRef.current = result.filesVersion;
          }).catch((err) => {
            console.error('Legacy migration failed', err);
          });

          saveProject({
            projectName,
            prompt: initialPrompt,
            status: 'completed',
            isPublished: projectData.isPublished,
            isMultiPage: false,
            pageCount: 1,
          });
        }
      }

      if (loadedFiles.length > 0) {
        setFiles(loadedFiles);
        setHistory([loadedFiles]);
        setHistoryIndex(0);
        setHasLoaded(true);
      } else if (projectFiles.length === 0 && initialHTML === '') {
        setHasLoaded(true);
      }
    }
    // The `hasLoaded` guard makes this run once; the extra deps are listed for correctness rather
    // than because a re-run is expected.
  }, [projectFiles, initialHTML, projectData?._id, projectData?.isPublished, projectData?.filesVersion, hasLoaded, migrateLegacyFilesAction, saveProject, projectName, initialPrompt, user?.id]);

  useEffect(() => {
    if (modelHydratedRef.current) return;
    if (projectData === undefined) return;

    const fromProject = projectData?.selectedModel && projectData?.providerId
      ? { id: projectData.selectedModel, providerId: projectData.providerId }
      : getStoredSelectedModel();
    setSelectedModel(fromProject);
    modelHydratedRef.current = true;
  }, [projectData]);

  const handleSelectedModelChange = useCallback((next: { id: string; providerId: string }) => {
    setSelectedModel(next);
    setStoredSelectedModel(next);
    if (!projectData) return;
    void saveProject({
      projectName,
      prompt: projectData.prompt || initialPrompt,
      html: projectData.html,
      status: projectData.status,
      isPublished: projectData.isPublished ?? false,
      selectedModel: next.id || '',
      providerId: next.providerId || '',
    }).catch(() => { });
  }, [projectData, projectName, initialPrompt, saveProject]);

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data.type === 'navigate') {
        const path = e.data.path.startsWith('/') ? e.data.path.slice(1) : e.data.path;
        if (files.some(f => f.path === path)) {
          setActiveFilePath(path);
        } else if (path === '' && files.some(f => f.path === 'index.html')) {
          setActiveFilePath('index.html');
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [files]);

  const handleReset = () => {
    setIsResetDialogOpen(true);
  };

  const confirmReset = () => {
    if (history.length > 0) {
      setFiles(history[0]);
      setHistoryIndex(0);
    }
    setIsResetDialogOpen(false);
  };

  const activeFile = useMemo(() => 
    files.find(f => f.path === activeFilePath) || files[0]
  , [files, activeFilePath]);

  const previewHtml = useMemo(() => {
    if (files.length === 0) return '';
    
    return assembleFullPage(
      activeFilePath.endsWith('.html') ? activeFilePath : 'index.html', 
      files,
      projectName,
      {
        favicon: projectData?.favicon,
        globalSeo: projectData?.globalSeo,
        seoData: projectData?.seoData
      },
      true // isEditorPreview
    );
  }, [files, activeFilePath, projectName, projectData]);

  const deploy = useEditorDeploy({
    projectName,
    initialPrompt,
    files,
    userId: user?.id,
    projectData,
    // Passed unwidened: the `as (args: object)` casts that used to be here defeated argument
    // checking, which is how a stale `userId` kept being sent to mutations that had stopped
    // accepting one.
    saveProject,
    publishProject,
    addDeploymentHistory,
  });

  const historyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      const nextFiles = files.map(f => 
        f.path === activeFilePath ? { ...f, content: value } : f
      );
      setFiles(nextFiles);
      
      if (historyTimerRef.current) clearTimeout(historyTimerRef.current);
      historyTimerRef.current = setTimeout(() => {
        addToHistory(nextFiles);
      }, 1000);
    }
  };

  useEffect(() => {
    if (saveStatus !== 'saving' && saveStatus !== 'conflict') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [saveStatus]);

  const persistFiles = useCallback(async (
    nextFiles: ProjectFile[],
    opts?: { forceVersion?: number },
  ) => {
    if (!user || !projectData?._id || projectData.accessRole === 'viewer') return;
    // Single-flight: a second writer (autosave racing a transform apply, two quick
    // edits) queues behind the in-flight save instead of racing it with the same
    // expectedVersion — the loser would always trip the version guard.
    if (savingRef.current) {
      pendingSaveRef.current = nextFiles;
      return;
    }
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      let current = nextFiles;
      let override = opts?.forceVersion;
      for (;;) {
        const result = await saveFilesAction({
          projectId: projectData._id,
          files: current,
          expectedVersion: override ?? filesVersionRef.current ?? undefined,
        });
        filesVersionRef.current = result.filesVersion;
        override = undefined;
        const queued = pendingSaveRef.current;
        pendingSaveRef.current = null;
        if (!queued) break;
        current = queued;
      }
      setConflictKind(null);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      pendingSaveRef.current = null;
      const message = err instanceof Error ? err.message : '';
      // A version mismatch means another writer (transform apply, migration,
      // second tab) landed first. Park in conflict and let the user choose —
      // retrying the same stale snapshot would fail forever and spam the console.
      // (Previously the autosave kept retrying the stale write on every render.)
      console.error('Save failed', err);
      setConflictKind(message.includes('changed since they were loaded') ? 'version' : 'error');
      setSaveStatus('conflict');
    } finally {
      savingRef.current = false;
    }
  }, [user, projectData?._id, projectData?.accessRole, saveFilesAction]);

  useEffect(() => {
    if (!user || !files.length || !projectData?._id) return;
    // Never auto-retry while a save is in flight or parked in conflict — the
    // parked snapshot is stale by definition and would fail forever.
    if (saveStatus === 'saving' || saveStatus === 'conflict') return;

    const timer = setTimeout(() => {
      void persistFiles(files);
    }, 2000);

    return () => clearTimeout(timer);
  }, [files, user, projectData?._id, saveStatus, persistFiles]);

  const handleConflictReload = async () => {
    const ok = await confirm({
      title: 'Load latest version?',
      description:
        'Someone else saved changes to this project. Loading the latest discards your unsaved edits.',
      confirmLabel: 'Load latest',
    });
    if (!ok || !projectFiles) return;
    const serverFiles = (projectFiles as Array<{ path: string; content: string; language: string; fileType: string }>).map((f) => ({
      path: f.path,
      content: f.content,
      language: f.language as ProjectFile['language'],
      fileType: f.fileType as ProjectFile['fileType'],
    }));
    filesVersionRef.current = projectData?.filesVersion ?? filesVersionRef.current;
    setConflictKind(null);
    setSaveStatus('idle');
    setFiles(serverFiles);
  };

  const handleConflictOverwrite = async () => {
    const ok = await confirm({
      title: 'Save your version anyway?',
      description:
        'This replaces the latest saved files with what you see in the editor. Changes saved by others will be lost.',
      confirmLabel: 'Save anyway',
    });
    if (!ok) return;
    await persistFiles(files, {
      forceVersion: projectData?.filesVersion ?? filesVersionRef.current ?? undefined,
    });
  };

  const { isTransforming, transformProgress, runTransform, runPolish, cancelTransform } = useProjectTransform({
    projectName,
    activeFilePath,
    files,
    setFiles,
    addToHistory,
    persistFiles,
    selectedModel,
    transformPrompt,
    setTransformPrompt,
    selectedElement,
    setSelectedElement,
    onRunStarted: async (prompt) => {
      if (!projectData?._id) return;
      activeTransformRun.current = await createRun({ projectId: projectData._id, kind: 'build', prompt });
      await appendMessage({ projectId: projectData._id, role: 'user', content: prompt, status: 'completed' });
    },
    onRunEvent: async (event) => {
      if (!projectData?._id || !activeTransformRun.current || event.status === 'complete' || event.status === 'error') return;
      const message = 'message' in event && event.message ? event.message : event.status === 'applying' ? `${event.tool}${event.path ? ` → ${event.path}` : ''}` : event.status;
      await appendRunEvent({ projectId: projectData._id, runId: activeTransformRun.current, type: event.status, message, path: 'path' in event ? event.path : undefined });
    },
    onRunCompleted: async (prompt, nextFiles) => {
      if (!projectData?._id) return;
      const messageId = await appendMessage({
        projectId: projectData._id,
        role: 'assistant',
        content: `Implemented: ${prompt}`,
        status: 'completed',
        detailsJson: JSON.stringify({ files: nextFiles.map((file) => file.path) }),
      });
      await createVersion({ projectId: projectData._id, messageId, summary: prompt, filesJson: JSON.stringify(nextFiles) });
      if (activeTransformRun.current) await finishRun({ projectId: projectData._id, runId: activeTransformRun.current, status: 'completed' });
      activeTransformRun.current = null;
    },
    onRunFailed: async (prompt, message) => {
      if (!projectData?._id) return;
      await appendMessage({ projectId: projectData._id, role: 'system', content: `Build failed: ${message}`, status: 'failed', detailsJson: JSON.stringify({ prompt }) });
      if (activeTransformRun.current) await finishRun({ projectId: projectData._id, runId: activeTransformRun.current, status: 'failed', errorCode: 'TRANSFORM_ERROR', errorMessage: message });
      activeTransformRun.current = null;
    },
    onRunCancelled: async () => {
      if (!projectData?._id || !activeTransformRun.current) return;
      await finishRun({ projectId: projectData._id, runId: activeTransformRun.current, status: 'cancelled' });
      activeTransformRun.current = null;
    },
  });

  const runDiscussion = useCallback(async (promptOverride?: string) => {
    const prompt = promptOverride?.trim() || transformPrompt.trim();
    if (!prompt || isDiscussing) return;
    setIsDiscussing(true);
    try {
      const response = await fetch('/api/discuss', {
        method: 'POST',
        headers: withAIAdminHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          projectName,
          prompt,
          modelId: selectedModel.id || undefined,
          providerId: selectedModel.providerId || undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Discussion failed');
      setTransformPrompt('');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Discussion failed');
    } finally {
      setIsDiscussing(false);
    }
  }, [isDiscussing, projectName, selectedModel, transformPrompt]);

  const deployLivePreview = useCallback(async () => {
    setIsDeployingPreview(true);
    try {
      let response = await fetch('/api/cloudflare/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }) });
      let data = await response.json();
      if (!response.ok && data.needsConfirmation) {
        const approved = await confirm({
          title: 'Create isolated preview resources?',
          description: 'This preview needs its own Cloudflare resources. They live for 24 hours and are billable.',
          confirmLabel: 'Create for 24 hours',
        });
        if (!approved) return;
        response = await fetch('/api/cloudflare/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName, confirmResources: true }) });
        data = await response.json();
      }
      if (!response.ok) throw new Error(data.error || 'Preview deployment failed');
      toast.success('Live backend preview deployed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Preview deployment failed');
    } finally {
      setIsDeployingPreview(false);
    }
  }, [projectName, confirm]);

  const deleteLivePreview = useCallback(async () => {
    const approved = await confirm({
      title: 'Delete this preview?',
      description: 'The preview and its isolated Cloudflare resources are removed. Your project files are untouched.',
      confirmLabel: 'Delete preview',
      destructive: true,
    });
    if (!approved) return;
    const response = await fetch('/api/cloudflare/preview', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }) });
    const data = await response.json();
    if (!response.ok) {
      toast.error(data.error || 'Preview cleanup failed');
      return;
    }
    toast.success('Live preview resources deleted');
  }, [projectName, confirm]);

  const handleNewFile = (type: ProjectFile['fileType']) => {
    setNewFileType(type);
    setNewFileName(type === 'worker' ? '_worker.js' : type === 'migration' ? 'migrations/0001_init.sql' : type === 'config' ? 'wrangler.jsonc' : '');
    setNewFileInFolderPath(null);
    setIsNewFileDialogOpen(true);
  };

  const handleNewFileInFolder = (folderPath: string, type: ProjectFile['fileType']) => {
    setNewFileInFolderPath(folderPath);
    setNewFileType(type);
    setNewFileName(type === 'migration' ? '0001_init.sql' : '');
    setIsNewFileDialogOpen(true);
  };

  const handleDuplicateItem = (path: string) => {
    const file = files.find(f => f.path === path);
    if (!file) return;

    const parts = path.split('/');
    const fileName = parts.pop()!;
    const nameParts = fileName.split('.');
    const ext = nameParts.length > 1 ? `.${nameParts.pop()}` : '';
    const baseName = nameParts.join('.');
    
    let newPath = '';
    let counter = 1;
    const parentPath = parts.length > 0 ? parts.join('/') + '/' : '';
    
    do {
      newPath = `${parentPath}${baseName}_copy${counter}${ext}`;
      counter++;
    } while (files.some(f => f.path === newPath));

    const newFile: ProjectFile = {
      ...file,
      path: newPath
    };

    const nextFiles = [...files, newFile];
    setFiles(nextFiles);
    addToHistory(nextFiles);
    persistFiles(nextFiles);
    setActiveFilePath(newPath);
  };

  const confirmNewFile = () => {
    if (!newFileName) return;
    
    let finalPath = newFileName;
    if (newFileInFolderPath) {
      const folder = newFileInFolderPath.endsWith('/') ? newFileInFolderPath : `${newFileInFolderPath}/`;
      finalPath = `${folder}${newFileName}`;
    }

    if (newFileType === 'worker' && finalPath !== '_worker.js') {
      toast.error('Rename blocked', { description: 'The Cloudflare Worker entrypoint must be named _worker.js at the project root.' });
      return;
    }
    if (newFileType === 'migration' && !finalPath.startsWith('migrations/')) {
      finalPath = `migrations/${finalPath.replace(/^\/+/, '')}`;
    }
    if (newFileType === 'config' && !['wrangler.jsonc', 'wrangler.json'].includes(finalPath)) {
      toast.error('Rename blocked', { description: 'The Cloudflare configuration must be named wrangler.jsonc at the project root.' });
      return;
    }

    if (files.some(f => f.path === finalPath)) {
      toast.error('File already exists');
      return;
    }

    const lang: ProjectFile['language'] = finalPath.endsWith('.css')
      ? 'css'
      : finalPath.endsWith('.sql')
        ? 'sql'
        : finalPath.endsWith('.json') || finalPath.endsWith('.jsonc')
          ? 'json'
          : finalPath.endsWith('.js')
          ? 'javascript'
          : 'html';
    const newFile: ProjectFile = {
      path: finalPath,
      content: newFileType === 'worker'
        ? "export default {\n  async fetch(request, env) {\n    return env.ASSETS.fetch(request);\n  },\n};"
        : newFileType === 'config'
          ? `{\n  "$schema": "node_modules/wrangler/config-schema.json",\n  "name": "${projectName}",\n  "main": "_worker.js",\n  "compatibility_date": "2026-08-09",\n  "assets": { "directory": ".", "binding": "ASSETS" },\n  "observability": { "enabled": true }\n}`
          : '',
      language: lang,
      fileType: newFileType as ProjectFile['fileType']
    };

    const nextFiles = [...files, newFile];
    setFiles(nextFiles);
    addToHistory(nextFiles);
    persistFiles(nextFiles);
    setActiveFilePath(finalPath);
    setIsNewFileDialogOpen(false);
    setNewFileInFolderPath(null);
  };

  const handleNewFolder = () => {
    setNewFolderName('');
    setIsNewFolderDialogOpen(true);
  };

  const confirmNewFolder = () => {
    if (!newFolderName) return;
    
    const folderPath = newFolderName.endsWith('/') ? newFolderName : `${newFolderName}/`;
    if (files.some(f => f.path.startsWith(folderPath) || f.path === newFolderName)) {
      toast.error('A file or folder with this name already exists');
      return;
    }

    // Create a .keep file to make the folder persistent
    const newFile: ProjectFile = {
      path: `${folderPath}.keep`,
      content: '',
      language: 'html',
      fileType: 'partial'
    };

    const nextFiles = [...files, newFile];
    setFiles(nextFiles);
    addToHistory(nextFiles);
    persistFiles(nextFiles);
    setIsNewFolderDialogOpen(false);
  };

  const handleDeleteItem = (path: string, type: 'file' | 'folder') => {
    setItemToDelete({ path, type });
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    const { path, type } = itemToDelete;
    
    let nextFiles: ProjectFile[] = [];
    if (type === 'file') {
      nextFiles = files.filter(f => f.path !== path);
    } else {
      const prefix = path.endsWith('/') ? path : `${path}/`;
      nextFiles = files.filter(f => !f.path.startsWith(prefix));
    }
    
    setFiles(nextFiles);
    addToHistory(nextFiles);
    persistFiles(nextFiles);

    if (type === 'file' && activeFilePath === path) {
      setActiveFilePath('index.html');
    } else if (type === 'folder' && activeFilePath?.startsWith(path.endsWith('/') ? path : `${path}/`)) {
      setActiveFilePath('index.html');
    }

    setIsDeleteDialogOpen(false);
    setItemToDelete(null);
  };

  const filteredQuickOpenFiles = useMemo(() => {
    if (!quickOpenSearch) return files;
    const search = quickOpenSearch.toLowerCase();
    return files.filter(f => f.path.toLowerCase().includes(search));
  }, [files, quickOpenSearch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // While typing in an input or textarea, only save stays active —
      // sidebar toggles would swallow characters meant for the field.
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        persistFiles(files);
      }

      if (isInput) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setIsExplorerVisible(prev => !prev);
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        setIsRightSidebarVisible(prev => !prev);
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setIsQuickOpenOpen(true);
        setQuickOpenIndex(0);
      }

    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, persistFiles, activeFile, isQuickOpenOpen, isNewFileDialogOpen, isNewFolderDialogOpen, isRenameDialogOpen, isDeleteDialogOpen, isExplorerVisible, isRightSidebarVisible]);

  useEffect(() => {
    if (!isQuickOpenOpen) {
      setQuickOpenSearch('');
      setQuickOpenIndex(0);
    }
  }, [isQuickOpenOpen]);

  // Keep the highlighted Quick Open result in view as the user arrows through it.
  useEffect(() => {
    quickOpenListRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [quickOpenIndex, isQuickOpenOpen]);

  const handleRenameItem = (path: string) => {
    setItemToRename(path);
    const name = path.endsWith('/') ? path.slice(0, -1).split('/').pop()! : path.split('/').pop()!;
    setRenameValue(name);
    setIsRenameDialogOpen(true);
  };

  const confirmRename = () => {
    if (!itemToRename || !renameValue) return;
    
    const oldPath = itemToRename;
    
    const parentPath = oldPath.split('/').slice(0, -1).join('/');
    const newPath = parentPath ? `${parentPath}/${renameValue}` : renameValue;

    if (files.some(f => f.path === newPath)) {
      toast.error('An item with this name already exists');
      return;
    }

    const nextFiles = files.map(f => {
      if (f.path === oldPath) {
        if (activeFilePath === oldPath) setActiveFilePath(newPath);
        return { ...f, path: newPath };
      }
      
      const folderPrefix = `${oldPath}/`;
      if (f.path.startsWith(folderPrefix)) {
        const newFolderPrefix = `${newPath}/`;
        const updatedPath = f.path.replace(folderPrefix, newFolderPrefix);
        if (activeFilePath === f.path) setActiveFilePath(updatedPath);
        return { ...f, path: updatedPath };
      }
      
      return f;
    });

    setFiles(nextFiles);
    addToHistory(nextFiles);
    persistFiles(nextFiles);

    setIsRenameDialogOpen(false);
    setItemToRename(null);
  };

  const handleMoveItem = (sourcePath: string, destFolderPath: string) => {
    if (sourcePath === destFolderPath) return;

    const sourceName = sourcePath.split('/').pop()!;
    const targetDir = destFolderPath.endsWith('/') ? destFolderPath : `${destFolderPath}/`;
    const newPathBase = `${targetDir}${sourceName}`;

    if (files.some(f => f.path === newPathBase)) {
        toast.error(`An item named “${sourceName}” already exists in “${destFolderPath}”`);
        return;
    }

    const nextFiles = files.map(f => {
      if (f.path === sourcePath) {
        if (activeFilePath === f.path) setActiveFilePath(newPathBase);
        return { ...f, path: newPathBase };
      }
      
      if (f.path.startsWith(`${sourcePath}/`)) {
        const newPath = f.path.replace(sourcePath, newPathBase);
        if (activeFilePath === f.path) setActiveFilePath(newPath);
        return { ...f, path: newPath };
      }
      
      return f;
    });

    setFiles(nextFiles);
    addToHistory(nextFiles);
    persistFiles(nextFiles);
  };

  const handleMoveAndReorder = (sourcePath: string, destFolderPath: string, targetPath: string) => {
    const sourceName = sourcePath.split('/').pop()!;
    const targetDir = destFolderPath.endsWith('/') ? destFolderPath : `${destFolderPath}/`;
    const newPathBase = `${targetDir}${sourceName}`;

    const movedFiles = files.map(f => {
      if (f.path === sourcePath) {
        if (activeFilePath === f.path) setActiveFilePath(newPathBase);
        return { ...f, path: newPathBase };
      }
      if (f.path.startsWith(`${sourcePath}/`)) {
        const newPath = f.path.replace(sourcePath, newPathBase);
        if (activeFilePath === f.path) setActiveFilePath(newPath);
        return { ...f, path: newPath };
      }
      return f;
    });

    const result = [...movedFiles];
    const sourceIndex = result.findIndex(f => f.path === newPathBase);
    const destIndex = result.findIndex(f => f.path === targetPath);
    
    if (sourceIndex !== -1 && destIndex !== -1) {
      const [removed] = result.splice(sourceIndex, 1);
      result.splice(destIndex, 0, removed);
    }
    
    setFiles(result);
    addToHistory(result);
    persistFiles(result);
  };

  const handleReorderFiles = (sourcePath: string, destinationPath: string) => {
    const result = [...files];
    const sourceIndex = result.findIndex(f => f.path === sourcePath);
    const destIndex = result.findIndex(f => f.path === destinationPath);
    
    if (sourceIndex === -1 || destIndex === -1) return;
    
    const [removed] = result.splice(sourceIndex, 1);
    result.splice(destIndex, 0, removed);
    
    setFiles(result);
    addToHistory(result);
    persistFiles(result);
  };

  const onPolishSubmit = async () => {
    setIsPolishDialogOpen(false);
    await runPolish(polishDescription);
  };

  const downloadZip = async () => {
    setIsExporting(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      files.forEach(f => {
        zip.file(f.path, f.content);
      });
      
      let readmeContent = `# ${projectName}\n\n${initialPrompt}\n\n---\nMade by [Mini App Factory](https://github.com/Aditya190803/mini-app-factory)`;
      
      try {
        // No `files` key: the route's schema is .strict() and does not accept one, so sending it
        // made every request 400 and silently fall back to the stub README below — the AI README
        // has never actually shipped in an export. The route reads the project's files itself.
        const response = await fetch('/api/generate/readme', {
          method: 'POST',
          headers: withAIAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            projectName,
            prompt: initialPrompt,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.content) {
            readmeContent = data.content;
          }
        } else {
          // Keep the fallback, but do not swallow the reason — this failing quietly is what hid
          // the bug in the first place.
          console.warn(
            `README generation failed (${response.status}), using fallback README`
          );
        }
      } catch (err) {
        console.error('Failed to generate AI README, using fallback', err);
      }

      zip.file('README.md', readmeContent);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Zip failed', err);
      toast.error('Export failed', {
        description: err instanceof Error ? err.message : 'The ZIP could not be generated.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenPreviewInNewTab = async () => {
    const previewPath = `/preview/${projectName}`;

    try {
      await persistFiles(files);
    } catch (err) {
      console.error('Failed to persist files before opening preview', err);
      toast.error('Could not save latest changes before opening preview.');
    }

    window.open(previewPath, '_blank');
  };

  const buildTarget = resolveTarget(projectData?.target, files);
  const isViewer = projectData?.accessRole === 'viewer';

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
        onExport={downloadZip}
        onDeploy={() =>
          isViewer
            ? toast.info('You have viewer access, which is read only')
            : deploy.setIsDeployDialogOpen(true)
        }
        isDeploying={deploy.isDeploying}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={undo}
        onRedo={redo}
        onHelp={() => setIsHelpDialogOpen(true)}
        onLibrary={() =>
          isViewer ? toast.info('You have viewer access, which is read only') : setIsLibraryOpen(true)
        }
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

      {/* Save conflicts get a bar rather than a toast: the user has to be able
          to read the two recovery options and pick one, and a toast times out
          while they are still deciding. */}
      {saveStatus === 'conflict' && conflictKind === 'version' && (
        <div className="border-b border-[var(--rule)] px-3 py-2">
          <Callout
            tone="failed"
            title="Someone else saved this project"
            action={
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void handleConflictReload()}>
                  Load theirs
                </Button>
                <Button size="sm" intent="danger" onClick={() => void handleConflictOverwrite()}>
                  Keep mine
                </Button>
              </div>
            }
          >
            Your edits are still here, held locally. Nothing has been lost, and nothing has been
            written.
          </Callout>
        </div>
      )}

      {saveStatus === 'conflict' && conflictKind === 'error' && (
        <div className="border-b border-[var(--rule)] px-3 py-2">
          <Callout
            tone="failed"
            title="Your changes could not be saved"
            action={
              <Button size="sm" onClick={() => void persistFiles(files)}>
                Try again
              </Button>
            }
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
          const nextFiles = [...files, file];
          setFiles(nextFiles);
          setActiveFilePath(file.path);
          addToHistory(nextFiles);
          void persistFiles(nextFiles);
        }}
      />

      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {/* Panes collapse by unmounting rather than animating width. Animating
            a layout property on a pane containing an iframe and Monaco makes
            both relayout on every frame. */}
        {isRightSidebarVisible && (
          <div className="flex shrink-0 flex-col overflow-hidden max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-[var(--z-overlay)] max-xl:shadow-[var(--shadow-lg)]">
            <EditorSidebar
              transformPrompt={transformPrompt}
              setTransformPrompt={setTransformPrompt}
              selectedModel={selectedModel}
              setSelectedModel={handleSelectedModelChange}
              selectedElement={selectedElement}
              setSelectedElement={setSelectedElement}
              runTransform={chatMode === 'build' ? runTransform : runDiscussion}
              runPolish={() => setIsPolishDialogOpen(true)}
              isTransforming={isTransforming || isDiscussing}
              transformProgress={transformProgress}
              onCancelTransform={cancelTransform}
              mode={chatMode}
              onModeChange={setChatMode}
              filePaths={files.map((file) => file.path)}
              messages={[
                ...((projectMessages?.length || 0) === 0
                  ? [
                      {
                        id: 'initial-prompt',
                        role: 'user' as const,
                        content: initialPrompt,
                        status: 'completed',
                      },
                    ]
                  : []),
                ...(projectMessages || []).map((message) => ({
                  id: message._id,
                  role: message.role,
                  content: message.content,
                  status: message.status,
                  files: (() => {
                    try {
                      return (JSON.parse(message.detailsJson || '{}') as { files?: string[] }).files || [];
                    } catch {
                      return [];
                    }
                  })(),
                })),
              ]}
              versions={(projectVersions || []).map((version) => ({
                id: version._id,
                summary: version.summary,
              }))}
              onRestoreVersion={async (versionId) => {
                if (!projectData?._id) return;
                const restored = await restoreVersion({
                  projectId: projectData._id,
                  versionId: versionId as Id<'projectVersions'>,
                });
                const restoredFiles = restored as ProjectFile[];
                setFiles(restoredFiles);
                addToHistory(restoredFiles);
                toast.success('Version restored');
              }}
            />
          </div>
        )}

        {isExplorerVisible && (
          <div className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-[var(--rule)] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-[var(--z-sticky)] max-lg:shadow-[var(--shadow-lg)]">
            <FileTree
              files={files}
              activeFilePath={activeFilePath}
              onFileSelect={setActiveFilePath}
              onNewFile={handleNewFile}
              onNewFolder={handleNewFolder}
              onDeleteItem={handleDeleteItem}
              onRenameItem={handleRenameItem}
              onDuplicateItem={handleDuplicateItem}
              onNewFileInFolder={handleNewFileInFolder}
              onMoveItem={handleMoveItem}
              onMoveAndReorder={handleMoveAndReorder}
              onReorderFiles={handleReorderFiles}
            />
          </div>
        )}

        <main className="flex min-w-0 flex-1 overflow-hidden">
          {activeTab === 'preview' && (
            <PreviewPanel
              previewHtml={previewHtml}
              files={files}
              onOpenInNewTab={handleOpenPreviewInNewTab}
              livePreviewUrl={
                (projectData?.cloudflarePreviewExpiresAt || 0) > Date.now()
                  ? projectData?.cloudflarePreviewUrl
                  : undefined
              }
              isDeployingPreview={isDeployingPreview}
              onDeployLivePreview={deployLivePreview}
              onDeleteLivePreview={deleteLivePreview}
              onOpenInEditor={(path, html) => {
                setActiveFilePath(path);
                setActiveTab('code');
                if (html) setEditorSearchText(html);
              }}
              onAttachToChat={(path, html, selector) => setSelectedElement({ path, html, selector })}
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
                <CodePanel
                  html={activeFile.content}
                  language={activeFile.language}
                  onChange={handleEditorChange}
                  onReset={handleReset}
                />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <PreviewPanel
                  previewHtml={previewHtml}
                  files={files}
                  onOpenInNewTab={handleOpenPreviewInNewTab}
                  livePreviewUrl={
                    (projectData?.cloudflarePreviewExpiresAt || 0) > Date.now()
                      ? projectData?.cloudflarePreviewUrl
                      : undefined
                  }
                  isDeployingPreview={isDeployingPreview}
                  onDeployLivePreview={deployLivePreview}
                  onDeleteLivePreview={deleteLivePreview}
                  onOpenInEditor={(path, html) => {
                    setActiveFilePath(path);
                    if (html) setEditorSearchText(html);
                  }}
                  onAttachToChat={(path, html, selector) =>
                    setSelectedElement({ path, html, selector })
                  }
                />
              </div>
            </div>
          )}
        </main>
      </div>

      <Modal open={isPolishDialogOpen} onOpenChange={setIsPolishDialogOpen}>
        <ModalContent
          size="sm"
          title="Polish pass"
          description="One request covering the finishing work. It edits files like any other build request, and the result is a restorable version."
          footer={
            <>
              <Button onClick={() => setIsPolishDialogOpen(false)}>Cancel</Button>
              <Button intent="primary" onClick={onPolishSubmit}>
                Run the pass
              </Button>
            </>
          }
        >
          <Field label="What should it focus on" hint="Ctrl and Enter runs it.">
            <Textarea
              autoFocus
              value={polishDescription}
              onChange={(event) => setPolishDescription(event.target.value)}
              onKeyDown={(event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault();
                  void onPolishSubmit();
                }
              }}
              className="min-h-24"
            />
          </Field>
        </ModalContent>
      </Modal>

      <Modal open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
        <ModalContent
          title="Shortcuts and tips"
          description="How the workspace is meant to be driven."
          footer={
            <Button intent="primary" onClick={() => setIsHelpDialogOpen(false)}>
              Close
            </Button>
          }
        >
          <div className="space-y-6">
            <section>
              <h3 className="key">Keyboard</h3>
              <div className="mt-2">
                <SpecTable
                  dense
                  caption="Keyboard shortcuts"
                  rows={[
                    { key: 'quick', label: <Kbd>Ctrl P</Kbd>, value: 'Jump to a file. Arrow keys move, Enter opens.' },
                    { key: 'save', label: <Kbd>Ctrl S</Kbd>, value: 'Save every file now.' },
                    { key: 'files', label: <Kbd>Ctrl B</Kbd>, value: 'Show or hide the file tree.' },
                    { key: 'chat', label: <Kbd>Ctrl I</Kbd>, value: 'Show or hide the conversation.' },
                    { key: 'send', label: <Kbd>Ctrl Enter</Kbd>, value: 'Send the request in the composer.' },
                  ]}
                />
              </div>
            </section>

            <section>
              <h3 className="key">Getting better results</h3>
              <ul className="mt-2 space-y-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                <li>
                  Name the outcome, not the styling. &ldquo;Overdue invoices sort to the top&rdquo;
                  beats &ldquo;make it modern&rdquo;.
                </li>
                <li>
                  Use the crosshair in the preview to pick an element, then describe the change. The
                  selected element is sent with the request.
                </li>
                <li>
                  Switch the conversation to Discuss when you want an answer rather than an edit.
                  Discuss never writes files.
                </li>
                <li>Type @ in the composer to reference a file by path.</li>
              </ul>
            </section>
          </div>
        </ModalContent>
      </Modal>

      <Modal open={isExporting} onOpenChange={setIsExporting}>
        <ModalContent
          size="sm"
          title="Building the export"
          description="Generating a README and bundling every file into a zip. This takes a few seconds."
        >
          <div className="flex items-center gap-3 text-sm text-[var(--muted-foreground)]">
            <Spinner />
            Packaging the project
          </div>
        </ModalContent>
      </Modal>

      <EditorDeployDialog projectName={projectName} deploy={deploy} target={buildTarget} />

      <Modal open={isNewFileDialogOpen} onOpenChange={setIsNewFileDialogOpen}>
        <ModalContent
          size="sm"
          title={`New ${newFileCopy[newFileType].label.toLowerCase()}`}
          description={newFileCopy[newFileType].description}
          footer={
            <>
              <Button onClick={() => setIsNewFileDialogOpen(false)}>Cancel</Button>
              <Button intent="primary" onClick={confirmNewFile}>
                Create
              </Button>
            </>
          }
        >
          <Field label="Path" hint={`For example ${newFileCopy[newFileType].placeholder}`}>
            <Input
              autoFocus
              value={newFileName}
              onChange={(event) => setNewFileName(event.target.value)}
              placeholder={newFileCopy[newFileType].placeholder}
              className="font-mono"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirmNewFile();
                }
              }}
            />
          </Field>
        </ModalContent>
      </Modal>

      <Modal open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
        <ModalContent
          size="sm"
          title="New folder"
          description="Folders group files in the tree. An empty one is kept with a placeholder file."
          footer={
            <>
              <Button onClick={() => setIsNewFolderDialogOpen(false)}>Cancel</Button>
              <Button intent="primary" onClick={confirmNewFolder}>
                Create
              </Button>
            </>
          }
        >
          <Field label="Folder name">
            <Input
              autoFocus
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
              placeholder="assets"
              className="font-mono"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirmNewFolder();
                }
              }}
            />
          </Field>
        </ModalContent>
      </Modal>

      <Modal open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <ModalContent
          size="sm"
          title="Rename"
          description="References to this path elsewhere in the project are not rewritten for you."
          footer={
            <>
              <Button onClick={() => setIsRenameDialogOpen(false)}>Cancel</Button>
              <Button intent="primary" onClick={confirmRename}>
                Rename
              </Button>
            </>
          }
        >
          <Field label="New name">
            <Input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              className="font-mono"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  confirmRename();
                }
              }}
            />
          </Field>
        </ModalContent>
      </Modal>

      <Modal open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <ModalContent
          size="sm"
          title={`Delete this ${itemToDelete?.type ?? 'file'}?`}
          description={
            itemToDelete?.type === 'folder'
              ? 'Deleting a folder deletes everything inside it. This cannot be undone from here.'
              : 'This cannot be undone from here, though the previous build is still restorable from the version history.'
          }
          footer={
            <>
              <Button onClick={() => setIsDeleteDialogOpen(false)}>Cancel</Button>
              <Button intent="danger" onClick={confirmDeleteItem}>
                Delete
              </Button>
            </>
          }
        >
          <p className="font-mono text-sm">{itemToDelete?.path}</p>
          {itemToDelete?.type === 'folder' &&
            (() => {
              const prefix = itemToDelete.path.endsWith('/')
                ? itemToDelete.path
                : `${itemToDelete.path}/`;
              const contained = files.filter(
                (file) => file.path.startsWith(prefix) && !file.path.endsWith('.keep')
              );
              if (contained.length === 0) return null;
              return (
                <Callout
                  tone="failed"
                  className="mt-3"
                  title={`${contained.length} file${contained.length === 1 ? '' : 's'} will go with it`}
                >
                  <ul className="mt-1 space-y-0.5 font-mono text-xs">
                    {contained.slice(0, 8).map((file) => (
                      <li key={file.path}>{file.path}</li>
                    ))}
                    {contained.length > 8 && <li>and {contained.length - 8} more</li>}
                  </ul>
                </Callout>
              );
            })()}
        </ModalContent>
      </Modal>

      <Modal open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <ModalContent
          size="sm"
          title="Reset to the first build?"
          description="Every manual edit made since the project was generated is discarded."
          footer={
            <>
              <Button onClick={() => setIsResetDialogOpen(false)}>Cancel</Button>
              <Button intent="danger" onClick={confirmReset}>
                Reset
              </Button>
            </>
          }
        />
      </Modal>

      {/* Quick open. Its own overlay rather than a Modal, because it is a
          command surface: it opens near the top of the viewport, not centred,
          and the workspace behind it stays legible. */}
      {isQuickOpenOpen && (
        <div
          className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center bg-[oklch(0.14_0.006_62/0.4)] p-4 pt-[12vh]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsQuickOpenOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-label="Jump to a file"
            className="anim-rise w-full max-w-lg overflow-hidden rounded-xl border border-[var(--rule)] bg-[var(--popover)] shadow-[var(--shadow-lg)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--rule)] px-3">
              <Search aria-hidden className="size-4 shrink-0 text-[var(--muted-foreground)]" />
              <label htmlFor="quick-open" className="sr-only">
                Search files by path
              </label>
              <input
                id="quick-open"
                autoFocus
                value={quickOpenSearch}
                onChange={(event) => setQuickOpenSearch(event.target.value)}
                placeholder="Search files"
                className="h-11 flex-1 bg-transparent font-mono text-sm outline-none placeholder:text-[var(--muted-foreground)]"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setQuickOpenIndex((i) => Math.min(i + 1, filteredQuickOpenFiles.length - 1));
                  } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setQuickOpenIndex((i) => Math.max(i - 1, 0));
                  } else if (event.key === 'Escape') {
                    setIsQuickOpenOpen(false);
                  } else if (event.key === 'Enter' && filteredQuickOpenFiles.length > 0) {
                    event.preventDefault();
                    setActiveFilePath(
                      filteredQuickOpenFiles[quickOpenIndex]?.path ?? filteredQuickOpenFiles[0].path
                    );
                    setIsQuickOpenOpen(false);
                  }
                }}
              />
              <IconButton label="Close" size="sm" onClick={() => setIsQuickOpenOpen(false)}>
                <X className="size-4" />
              </IconButton>
            </div>

            <div ref={quickOpenListRef} className="scroll-thin max-h-80 overflow-y-auto p-1">
              {filteredQuickOpenFiles.length > 0 ? (
                filteredQuickOpenFiles.map((file, index) => (
                  <button
                    key={file.path}
                    type="button"
                    data-active={index === quickOpenIndex}
                    onMouseMove={() => setQuickOpenIndex(index)}
                    onClick={() => {
                      setActiveFilePath(file.path);
                      setIsQuickOpenOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[5px] px-2 py-1.5 text-left transition-colors',
                      index === quickOpenIndex ? 'row-selected' : 'hover:bg-[var(--surface-3)]'
                    )}
                  >
                    <span className="inline-block h-3 w-[3px] shrink-0 rounded-[1px] bg-[var(--rule-strong)]" />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{file.path}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                      {file.fileType}
                    </span>
                  </button>
                ))
              ) : (
                <p className="px-3 py-10 text-center text-sm text-[var(--muted-foreground)]">
                  No file matches that.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
