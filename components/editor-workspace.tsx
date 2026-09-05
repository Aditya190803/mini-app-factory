'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from "@stackframe/stack";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from '@/convex/_generated/dataModel';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Search } from 'lucide-react';
import { ProjectFile, assembleFullPage } from '@/lib/page-builder';
import { migrateProject } from '@/lib/migration';
import { toast } from 'sonner';
import { useConfirm } from '@/hooks/use-confirm';
import { withAIAdminHeaders } from '@/lib/ai-admin-client';
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
  const [isExporting, setIsExporting] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'conflict'>('idle');
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

  const persistFiles = useCallback(async (nextFiles: ProjectFile[]) => {
    if (!user || !projectData?._id || projectData.accessRole === 'viewer') return;
    setSaveStatus('saving');
    try {
      const result = await saveFilesAction({
        projectId: projectData._id,
        files: nextFiles,
        expectedVersion: filesVersionRef.current ?? undefined,
      });
      filesVersionRef.current = result.filesVersion;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      // A rejected save means someone else wrote to this project since we loaded it. Surfacing it
      // is the point — the previous behaviour logged to console and reset to idle, so the user was
      // told their work was saved when it was not.
      console.error('Save failed', err);
      setSaveStatus('conflict');
    }
  }, [user, projectData?._id, projectData?.accessRole, saveFilesAction]);

  useEffect(() => {
    if (!user || !files.length || !projectData?._id) return;

    const timer = setTimeout(async () => {
      persistFiles(files);
    }, 2000);

    return () => clearTimeout(timer);
  }, [files, user, projectData?._id, persistFiles]);

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

  return (
    <div className="flex h-dvh flex-col bg-background">
      {confirmDialog}
      <EditorHeader
        projectName={projectName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onBack={onBack}
        saveStatus={saveStatus}
        onExport={downloadZip}
        onDeploy={() => projectData?.accessRole === 'viewer' ? toast.info('Viewer access is read-only') : deploy.setIsDeployDialogOpen(true)}
        isDeploying={deploy.isDeploying}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={undo}
        onRedo={redo}
        onHelp={() => setIsHelpDialogOpen(true)}
        onLibrary={() => projectData?.accessRole === 'viewer' ? toast.info('Viewer access is read-only') : setIsLibraryOpen(true)}
        onSettings={() => router.push(`/edit/${projectName}/settings`)}
        isExplorerVisible={isExplorerVisible}
        onToggleExplorer={() => setIsExplorerVisible((visible) => !visible)}
        isChatVisible={isRightSidebarVisible}
        onToggleChat={() => setIsRightSidebarVisible((visible) => !visible)}
      />

      {projectData?.accessRole === 'viewer' ? <div className="border-b border-amber-400/20 bg-amber-400/5 px-4 py-2 text-center text-xs text-amber-200">Read-only access · Ask the project owner for editor access to make changes or deploy.</div> : null}

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

      <div className="relative flex flex-1 overflow-hidden">
        <AnimatePresence initial={false}>
          {isRightSidebarVisible && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 380, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex shrink-0 flex-col overflow-hidden max-xl:absolute max-xl:inset-y-0 max-xl:left-0 max-xl:z-30 max-xl:shadow-2xl"
            >
              <EditorSidebar
                transformPrompt={transformPrompt}
                setTransformPrompt={setTransformPrompt}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
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
                  ...((projectMessages?.length || 0) === 0 ? [{ id: 'initial-prompt', role: 'user' as const, content: initialPrompt, status: 'completed' }] : []),
                  ...(projectMessages || []).map((message) => ({
                    id: message._id,
                    role: message.role,
                    content: message.content,
                    status: message.status,
                    files: (() => {
                      try { return (JSON.parse(message.detailsJson || '{}') as { files?: string[] }).files || []; }
                      catch { return []; }
                    })(),
                  })),
                ]}
                versions={(projectVersions || []).map((version) => ({ id: version._id, summary: version.summary }))}
                onRestoreVersion={async (versionId) => {
                  if (!projectData?._id) return;
                  const restored = await restoreVersion({ projectId: projectData._id, versionId: versionId as Id<'projectVersions'> });
                  const restoredFiles = restored as ProjectFile[];
                  setFiles(restoredFiles);
                  addToHistory(restoredFiles);
                  toast.success('Project version restored');
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {isExplorerVisible && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 260, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className="flex shrink-0 flex-col overflow-hidden border-r border-[var(--border)] max-lg:absolute max-lg:inset-y-0 max-lg:left-0 max-lg:z-20 max-lg:shadow-2xl"
            >
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
            </motion.div>
          )}
        </AnimatePresence>
        
        <main className="flex min-w-0 flex-1 overflow-hidden bg-[var(--background-surface)]">
          {activeTab === 'preview' && (
            <PreviewPanel 
              previewHtml={previewHtml} 
              files={files}
              onOpenInNewTab={handleOpenPreviewInNewTab}
              livePreviewUrl={(projectData?.cloudflarePreviewExpiresAt || 0) > Date.now() ? projectData?.cloudflarePreviewUrl : undefined}
              isDeployingPreview={isDeployingPreview}
              onDeployLivePreview={deployLivePreview}
              onDeleteLivePreview={deleteLivePreview}
              onOpenInEditor={(path, html) => {
                setActiveFilePath(path);
                setActiveTab('code');
                if (html) setEditorSearchText(html);
              }}
              onAttachToChat={(path, html, selector) => {
                setSelectedElement({ path, html, selector });
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
            <div className="flex-1 flex">
              <div className="flex-1 border-r border-[var(--border)] overflow-hidden">
                <CodePanel
                  html={activeFile.content}
                  language={activeFile.language}
                  onChange={handleEditorChange}
                  onReset={handleReset}
                />
              </div>
              <div className="flex-1 overflow-hidden">
                <PreviewPanel 
                  previewHtml={previewHtml} 
                  files={files}
                  onOpenInNewTab={handleOpenPreviewInNewTab}
                  livePreviewUrl={(projectData?.cloudflarePreviewExpiresAt || 0) > Date.now() ? projectData?.cloudflarePreviewUrl : undefined}
                  isDeployingPreview={isDeployingPreview}
                  onDeployLivePreview={deployLivePreview}
                  onDeleteLivePreview={deleteLivePreview}
                  onOpenInEditor={(path, html) => {
                    setActiveFilePath(path);
                    if (html) setEditorSearchText(html);
                  }}
                  onAttachToChat={(path, html, selector) => {
                    setSelectedElement({ path, html, selector });
                  }}
                />
              </div>
            </div>
          )}
        </main>

      </div>

      <Dialog open={isPolishDialogOpen} onOpenChange={setIsPolishDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight">Polish Site</DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Describe how to polish this site (typography, animations, mobile responsiveness).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Textarea
              autoFocus
              value={polishDescription}
              onChange={(e) => setPolishDescription(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  void onPolishSubmit();
                }
              }}
              className="min-h-[100px] text-xs font-mono bg-[var(--background)] border-[var(--border)] focus-visible:ring-[var(--primary)]"
            />
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsPolishDialogOpen(false)}
              className="flex-1 font-mono uppercase text-[10px] border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--background-overlay)]"
            >
              Cancel
            </Button>
            <Button
              onClick={onPolishSubmit}
              className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
            >
              Apply Polish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
        <DialogContent className="sm:max-w-[500px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight flex items-center gap-2">
              <svg className="w-4 h-4 text-[var(--primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
              Quick Start & Tips
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Master the Mini App Factory workflow.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4 font-mono">
            <div className="space-y-2">
              <h4 className="text-[10px] text-[var(--primary)] uppercase font-black tracking-widest">Workflow</h4>
              <p className="text-[11px] leading-relaxed">
                <span className="text-[var(--secondary-text)]">1. FABRICATE:</span> Describe your idea and let the AI build the initial structure.
                <br />
                <span className="text-[var(--secondary-text)]">2. PREVIEW:</span> Switch between Desktop, Tablet, and Mobile views.
                <br />
                <span className="text-[var(--secondary-text)]">3. TRANSFORM:</span> Use the sidebar to ask for specific changes (e.g., "Add a contact form").
                <br />
                <span className="text-[var(--secondary-text)]">4. POLISH:</span> Use the Polish tool for finishing touches like animations and responsiveness.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] text-[var(--primary)] uppercase font-black tracking-widest">Keyboard Shortcuts</h4>
              <ul className="text-[11px] space-y-1 list-disc pl-4 text-[var(--muted-text)]">
                <li><span className="text-[var(--secondary-text)]">Ctrl/⌘ + P</span> — Quick Open: jump to any file (arrow keys to navigate)</li>
                <li><span className="text-[var(--secondary-text)]">Ctrl/⌘ + S</span> — Save all files now</li>
                <li><span className="text-[var(--secondary-text)]">Ctrl/⌘ + B</span> — Toggle the file explorer</li>
                <li><span className="text-[var(--secondary-text)]">Ctrl/⌘ + I</span> — Toggle the chat sidebar</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="text-[10px] text-[var(--primary)] uppercase font-black tracking-widest">Prompting Tips</h4>
              <ul className="text-[11px] space-y-1 list-disc pl-4 text-[var(--muted-text)]">
                <li>Be specific about colors, layout, and functionality.</li>
                <li>Ask for "Glassmorphism", "Dark Mode", or "Neo-brutalism" for modern styles.</li>
                <li>Mention libraries like "Framer Motion" or "Tailwind" for better results.</li>
                <li>Use <span className="text-[var(--secondary-text)]">Ctrl+Enter</span> to quickly apply AI transformations.</li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => setIsHelpDialogOpen(false)}
              className="w-full bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
            >
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isExporting} onOpenChange={setIsExporting}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight flex items-center gap-2">
              <Spinner className="text-[var(--primary)]" />
              Exporting Project
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Please wait while we generate a professional README using AI and bundle your project files into a ZIP.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <EditorDeployDialog projectName={projectName} deploy={deploy} />

      <Dialog open={isNewFileDialogOpen} onOpenChange={setIsNewFileDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight">
              New {newFileCopy[newFileType].label}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              {newFileCopy[newFileType].description}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={newFileCopy[newFileType].placeholder}
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-mono text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmNewFile();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <div className="flex justify-end gap-2 w-full">
              <Button
                variant="ghost"
                onClick={() => setIsNewFileDialogOpen(false)}
                className="font-mono uppercase text-[10px] font-black text-[var(--muted-text)]"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmNewFile}
                className="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
              >
                Create
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight">
              New Folder
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Enter a name for the new folder.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="assets"
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-mono text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmNewFolder();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <div className="flex justify-end gap-2 w-full">
              <Button
                variant="ghost"
                onClick={() => setIsNewFolderDialogOpen(false)}
                className="font-mono uppercase text-[10px] font-black text-[var(--muted-text)]"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmNewFolder}
                className="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
              >
                Create
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight text-[var(--primary)]">
              Rename Item
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Enter a new name for the item.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] text-[var(--foreground)] font-mono text-xs rounded-md focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  confirmRename();
                }
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            <div className="flex justify-end gap-2 w-full">
              <Button
                variant="ghost"
                onClick={() => setIsRenameDialogOpen(false)}
                className="font-mono uppercase text-[10px] font-black text-[var(--muted-text)]"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmRename}
                className="bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
              >
                Rename
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight text-red-500">
              Delete {itemToDelete?.type === 'folder' ? 'Folder' : 'File'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              {itemToDelete?.type === 'folder' ? (
                <>
                  Are you sure you want to delete the folder <span className="text-[var(--foreground)] font-bold">{itemToDelete.path}</span>?
                  {(() => {
                    const prefix = itemToDelete.path.endsWith('/') ? itemToDelete.path : `${itemToDelete.path}/`;
                    const hasFiles = files.some(f => f.path.startsWith(prefix) && !f.path.endsWith('.keep'));
                    return hasFiles ? (
                      <span className="block mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 font-bold uppercase text-[10px]">
                        Warning: This folder contains files. All of them will be permanently deleted.
                      </span>
                    ) : null;
                  })()}
                </>
              ) : (
                <>
                  Are you sure you want to delete <span className="text-[var(--foreground)] font-bold">{itemToDelete?.path}</span>? This action cannot be undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex justify-end gap-2 w-full">
              <Button
                variant="ghost"
                onClick={() => setIsDeleteDialogOpen(false)}
                className="font-mono uppercase text-[10px] font-black text-[var(--muted-text)]"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmDeleteItem}
                className="bg-red-500 hover:bg-red-600 text-white font-mono uppercase text-[10px] font-black"
              >
                Delete
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight text-red-500">
              Reset Project
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Are you sure you want to reset to the initial version? <span className="text-[var(--foreground)] font-bold">All manual changes will be lost.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <div className="flex justify-end gap-2 w-full">
              <Button
                variant="ghost"
                onClick={() => setIsResetDialogOpen(false)}
                className="font-mono uppercase text-[10px] font-black text-[var(--muted-text)]"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmReset}
                className="bg-red-500 hover:bg-red-600 text-white font-mono uppercase text-[10px] font-black"
              >
                Reset
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isQuickOpenOpen} onOpenChange={setIsQuickOpenOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 gap-0 bg-[var(--background)] border-[var(--border)] overflow-hidden shadow-2xl">
          <DialogHeader className="sr-only">
            <DialogTitle>Quick Open Files</DialogTitle>
          </DialogHeader>
          <div className="flex items-center border-b border-[var(--border)] px-3">
            <Search className="w-4 h-4 text-[var(--muted-text)] mr-2" />
            <Input
              autoFocus
              placeholder="Search files..."
              className="flex-1 border-0 focus-visible:ring-0 bg-transparent text-sm h-12 font-mono"
              value={quickOpenSearch}
              onChange={(e) => setQuickOpenSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setQuickOpenIndex((i) => Math.min(i + 1, filteredQuickOpenFiles.length - 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setQuickOpenIndex((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter' && filteredQuickOpenFiles.length > 0) {
                  e.preventDefault();
                  setActiveFilePath(filteredQuickOpenFiles[quickOpenIndex]?.path ?? filteredQuickOpenFiles[0].path);
                  setIsQuickOpenOpen(false);
                }
              }}
            />
          </div>
          <div ref={quickOpenListRef} className="max-h-[300px] overflow-y-auto scrollbar-hide py-2">
            {filteredQuickOpenFiles.length > 0 ? (
              filteredQuickOpenFiles.map((file, index) => (
                <button
                  key={file.path}
                  data-active={index === quickOpenIndex}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-[var(--background-overlay)] flex items-center gap-3 transition-colors group',
                    index === quickOpenIndex && 'bg-[var(--background-overlay)]',
                  )}
                  onMouseMove={() => setQuickOpenIndex(index)}
                  onClick={() => {
                    setActiveFilePath(file.path);
                    setIsQuickOpenOpen(false);
                  }}
                >
                  <div className="w-8 h-8 rounded border border-[var(--border)] flex items-center justify-center bg-[var(--background)] group-hover:bg-[var(--background-overlay)] transition-colors">
                    <span className="text-[9px] uppercase font-bold text-[var(--muted-text)]">
                      {file.path.split('.').pop()}
                    </span>
                  </div>
                  <div className="flex flex-col flex-1 overflow-hidden">
                    <span className="text-xs font-mono truncate">{file.path}</span>
                    <span className="text-[9px] text-[var(--muted-text)] font-mono uppercase tracking-widest leading-none mt-1">
                      {file.fileType}
                    </span>
                  </div>
                  {activeFilePath === file.path && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                  )}
                </button>
              ))
            ) : (
              <div className="p-12 text-center text-xs text-[var(--muted-text)] font-mono uppercase tracking-widest opacity-50">
                No matching files
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
