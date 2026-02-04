'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUser } from "@stackframe/stack";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
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
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { ProjectFile, assembleFullPage } from '@/lib/page-builder';
import { migrateProject } from '@/lib/migration';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { extractNetlifySiteNameFromUrl, extractRepoFullNameFromUrl, extractRepoNameFromFullName, normalizeNetlifySiteName, normalizeRepoName, validateRepoName } from '@/lib/deploy-shared';
import { normalizeDeployError, performDeploy } from '@/lib/deploy-client';

import EditorHeader from './editor/editor-header';
import EditorSidebar from './editor/editor-sidebar';
import PreviewPanel from './editor/preview-panel';
import CodePanel from './editor/code-panel';
import FileTree from './editor/file-tree';

interface EditorWorkspaceProps {
  initialHTML: string;
  initialPrompt: string;
  projectName: string;
  onBack: () => void;
}

const applyFileDelta = (currentFiles: ProjectFile[], updates: ProjectFile[], deletedPaths: string[] = []) => {
  const map = new Map(currentFiles.map((file) => [file.path, file]));
  for (const file of updates) {
    map.set(file.path, file);
  }
  for (const path of deletedPaths) {
    map.delete(path);
  }
  return Array.from(map.values());
};

export default function EditorWorkspace({ initialHTML, initialPrompt, projectName, onBack }: EditorWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'split'>('preview');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('index.html');
  const [selectedElement, setSelectedElement] = useState<{ path: string, html: string, selector?: string } | null>(null);
  const [editorSearchText, setEditorSearchText] = useState<string>('');
  const [transformPrompt, setTransformPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<{ id: string, providerId: string }>({ id: '', providerId: '' });
  const [isTransforming, setIsTransforming] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeployDialogOpen, setIsDeployDialogOpen] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployStatus, setDeployStatus] = useState<string | null>(null);
  const [integrationStatus, setIntegrationStatus] = useState<{ githubConnected: boolean; netlifyConnected: boolean }>({
    githubConnected: false,
    netlifyConnected: false,
  });
  const [githubOrgs, setGithubOrgs] = useState<string[]>([]);
  const [githubOrg, setGithubOrg] = useState<string>('personal');
  const [repoVisibility, setRepoVisibility] = useState<'private' | 'public'>('private');
  const [deployOption, setDeployOption] = useState<'github-netlify' | 'github-only' | 'maf-hosted'>('github-netlify');
  const [repoName, setRepoName] = useState<string>(projectName);
  const [netlifySiteName, setNetlifySiteName] = useState<string>('');
  const [repoCheck, setRepoCheck] = useState<{ status: 'idle' | 'checking' | 'available' | 'taken' | 'error'; owner?: string; message?: string }>({ status: 'idle' });
  const [deployResult, setDeployResult] = useState<{ repoUrl?: string; deploymentUrl?: string; netlifySiteName?: string } | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deployNotice, setDeployNotice] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isPolishDialogOpen, setIsPolishDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
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
  const [isExplorerVisible, setIsExplorerVisible] = useState(true);
  const [isRightSidebarVisible, setIsRightSidebarVisible] = useState(true);
  const [isQuickOpenOpen, setIsQuickOpenOpen] = useState(false);
  const [quickOpenSearch, setQuickOpenSearch] = useState('');
  const lastProjectNameRef = useRef(projectName);

  // Global history for files
  const [history, setHistory] = useState<ProjectFile[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const user = useUser();
  const saveProject = useMutation(api.projects.saveProject);
  const saveFilesAction = useMutation(api.files.saveFiles);
  const publishProject = useMutation(api.projects.publishProject);
  const addDeploymentHistory = useMutation(api.deployments.addDeploymentHistory);
  const projectData = useQuery(api.projects.getProject, { projectName });
  const projectFiles = useQuery(api.files.getFilesByProject, 
    projectData?._id ? { projectId: projectData._id } : "skip"
  );

  const repoValidation = useMemo(() => validateRepoName(repoName), [repoName]);
  const normalizedRepoName = repoValidation.normalized || normalizeRepoName(projectName);
  const normalizedNetlifySiteName = useMemo(
    () => normalizeNetlifySiteName(netlifySiteName || normalizedRepoName),
    [netlifySiteName, normalizedRepoName]
  );
  const linkedRepoFullName = useMemo(
    () => extractRepoFullNameFromUrl(projectData?.repoUrl),
    [projectData?.repoUrl]
  );
  const linkedRepoName = useMemo(
    () => extractRepoNameFromFullName(linkedRepoFullName),
    [linkedRepoFullName]
  );
  const repoMismatch = useMemo(
    () => !!(linkedRepoName && normalizedRepoName && linkedRepoName !== normalizedRepoName),
    [linkedRepoName, normalizedRepoName]
  );

  const fetchIntegrationStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/integrations/status');
      if (resp.status === 401) {
        setIntegrationStatus({ githubConnected: false, netlifyConnected: false });
        return;
      }
      if (!resp.ok) {
        setIntegrationStatus({ githubConnected: false, netlifyConnected: false });
        return;
      }
      const data = await resp.json();
      setIntegrationStatus({
        githubConnected: !!data.githubConnected,
        netlifyConnected: !!data.netlifyConnected,
      });
    } catch (err) {
      console.error(err);
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
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!isDeployDialogOpen) return;
    fetchIntegrationStatus();
  }, [isDeployDialogOpen, fetchIntegrationStatus]);

  useEffect(() => {
    if (!isDeployDialogOpen) return;
    if (integrationStatus.githubConnected) {
      fetchGithubOrgs();
    }
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
    if (projectData?.netlifySiteName) {
      setNetlifySiteName(projectData.netlifySiteName);
    }
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
    if (!isDeployDialogOpen) return;
    if (!projectData) return;
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
        const resp = await fetch(`/api/integrations/github/check-repo?name=${encodeURIComponent(normalizedRepoName)}${ownerParam}`);
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
      } catch (err) {
        console.error(err);
        setRepoCheck({ status: 'error', message: 'Unable to verify repo name.' });
      }
    }, 500);

    return () => window.clearTimeout(handle);
  }, [normalizedRepoName, repoValidation.valid, repoValidation.message, githubOrg, deployOption, integrationStatus.githubConnected, projectData?.repoUrl]);

  const addToHistory = useCallback((currentFiles: ProjectFile[]) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push([...currentFiles]);
      // Limit history size
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

  // Load files from Convex or migrate
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
      } else if (initialHTML) {
        loadedFiles = migrateProject(initialHTML);
        
        // Save migrated files back to database if project exists
        if (projectData?._id) {
          saveFilesAction({
            projectId: projectData._id,
            files: loadedFiles
          });
          
          saveProject({
            projectName,
            prompt: initialPrompt,
            status: 'completed',
            isPublished: projectData.isPublished,
            isMultiPage: false,
            pageCount: 1,
            userId: user?.id
          });
        }
      }

      if (loadedFiles.length > 0) {
        setFiles(loadedFiles);
        setHistory([loadedFiles]);
        setHistoryIndex(0);
        setHasLoaded(true);
      } else if (projectFiles.length === 0 && initialHTML === '') {
        // Handle empty project case where we might be creating from scratch or something
        setHasLoaded(true);
      }
    }
  }, [projectFiles, initialHTML, projectData?._id, projectData?.isPublished, hasLoaded, saveFilesAction, saveProject, projectName, initialPrompt, user?.id]);

  // Handle message from preview iframe
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

  const persistFiles = useCallback(async (nextFiles: ProjectFile[]) => {
    if (!user || !projectData?._id) return;
    setSaveStatus('saving');
    try {
      await saveFilesAction({
        projectId: projectData._id,
        files: nextFiles
      });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      console.error('Save failed', err);
      setSaveStatus('idle');
    }
  }, [user, projectData?._id, saveFilesAction]);

  // Auto-save to Convex
  useEffect(() => {
    if (!user || !files.length || !projectData?._id) return;

    const timer = setTimeout(async () => {
      persistFiles(files);
    }, 2000);

    return () => clearTimeout(timer);
  }, [files, user, projectData?._id, persistFiles]);

  const runTransform = async () => {
    if (!transformPrompt.trim()) return;
    setIsTransforming(true);
    try {
      let finalPrompt = transformPrompt;

      if (selectedElement) {
        // Strip out the internal data-source-file attributes for better AI clarity
        const cleanHtml = selectedElement.html
          .replace(/ data-source-file="[^"]*"/g, '')
          .replace(/ style="display: contents;"/g, '');
        
        const selectorLine = selectedElement.selector ? `CSS selector: ${selectedElement.selector}\n` : '';
        finalPrompt = `Target element in ${selectedElement.path}:\n${selectorLine}${cleanHtml}\n\nInstructions: ${transformPrompt}`;
      }

      const response = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          projectName,
          activeFile: activeFilePath,
          prompt: finalPrompt,
          modelId: selectedModel.id || undefined,
          providerId: selectedModel.providerId || undefined
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const code = data.code || 'TRANSFORM_ERROR';
        const message = data.error || 'Transform failed';
        const suggestion = code === 'INVALID_TOOL_CALL'
          ? 'Try a simpler edit, or target a specific element with a clear selector.'
          : code === 'RATE_LIMITED'
            ? 'You are sending requests too quickly. Wait a moment and retry.'
            : code === 'INVALID_FILE_STRUCTURE'
              ? 'Ensure the project includes index.html and valid files before retrying.'
              : code === 'UNAUTHORIZED'
                ? 'Sign in again and retry the transform.'
                : 'Check your prompt and try again.';

        toast.error(message, { description: suggestion });
        throw new Error(message);
      }

      // Transition to streaming multi-file parser
      // For now, assume it returns full files
      const result = await response.json();
      if (result.full) {
        const fullFiles = Array.isArray(result.files) ? result.files : [];
        if (fullFiles.length === 0) {
          console.error('Transform returned full=true but no files array');
          toast.error('Transform returned no files', { description: 'The server indicated a full replacement but provided no files.' });
        }
        setFiles(fullFiles);
        addToHistory(fullFiles);
        persistFiles(fullFiles);
      } else if (Array.isArray(result.files)) {
        const nextFiles = applyFileDelta(files, result.files, result.deletedPaths || []);
        setFiles(nextFiles);
        addToHistory(nextFiles);
        persistFiles(nextFiles);
      }
      setTransformPrompt('');
      setSelectedElement(null);
    } catch (err) {
      console.error('Transform error', err);
    } finally {
      setIsTransforming(false);
    }
  };

  const handleNewFile = (type: ProjectFile['fileType']) => {
    setNewFileType(type);
    setNewFileName('');
    setNewFileInFolderPath(null);
    setIsNewFileDialogOpen(true);
  };

  const handleNewFileInFolder = (folderPath: string, type: ProjectFile['fileType']) => {
    setNewFileInFolderPath(folderPath);
    setNewFileType(type);
    setNewFileName('');
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

    if (files.some(f => f.path === finalPath)) {
      alert('File already exists');
      return;
    }

    const lang: ProjectFile['language'] = finalPath.endsWith('.css') ? 'css' : finalPath.endsWith('.js') ? 'javascript' : 'html';
    const newFile: ProjectFile = {
      path: finalPath,
      content: '', // Template could be added here
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
    
    // Check if folder or file with this name already exists
    const folderPath = newFolderName.endsWith('/') ? newFolderName : `${newFolderName}/`;
    if (files.some(f => f.path.startsWith(folderPath) || f.path === newFolderName)) {
      alert('A file or folder with this name already exists');
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
      // Folder deletion: remove all files starting with "path/"
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

  // Global shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea (unless it's the Quick Open input itself)
      const isInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      
      // Ctrl + S: Save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        persistFiles(files);
      }
      
      // Ctrl + B: Toggle Explorer Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setIsExplorerVisible(prev => !prev);
      }

      // Ctrl + I (or Ctrl + Shift + B): Toggle Right Sidebar
      // We'll use Ctrl + I as 'Instructions' or 'Insights'
      if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
        e.preventDefault();
        setIsRightSidebarVisible(prev => !prev);
      }
      
      // Ctrl + P: Quick Open
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setIsQuickOpenOpen(true);
      }

      // Del: Delete active file
      if (e.key === 'Delete' && !isInput && !isQuickOpenOpen && !isNewFileDialogOpen && !isNewFolderDialogOpen && !isRenameDialogOpen && !isDeleteDialogOpen) {
        // Only trigger if no dialog is open and we have an active file
        if (activeFile) {
          handleDeleteItem(activeFile.path, 'file');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [files, persistFiles, activeFile, isQuickOpenOpen, isNewFileDialogOpen, isNewFolderDialogOpen, isRenameDialogOpen, isDeleteDialogOpen, isExplorerVisible, isRightSidebarVisible]);

  useEffect(() => {
    if (!isQuickOpenOpen) {
      setQuickOpenSearch('');
    }
  }, [isQuickOpenOpen]);

  const handleRenameItem = (path: string) => {
    setItemToRename(path);
    // Extract the name part for initial value
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
      alert('An item with this name already exists');
      return;
    }

    const nextFiles = files.map(f => {
      // Exact match (file or the .keep file of a folder)
      if (f.path === oldPath) {
        if (activeFilePath === oldPath) setActiveFilePath(newPath);
        return { ...f, path: newPath };
      }
      
      // Nested items
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
    // If destination is same as source, skip
    if (sourcePath === destFolderPath) return;

    const sourceName = sourcePath.split('/').pop()!;
    const targetDir = destFolderPath.endsWith('/') ? destFolderPath : `${destFolderPath}/`;
    const newPathBase = `${targetDir}${sourceName}`;

    // Check for collisions
    if (files.some(f => f.path === newPathBase)) {
        alert(`An item named "${sourceName}" already exists in "${destFolderPath}"`);
        return;
    }

    const nextFiles = files.map(f => {
      // If it's the exact file
      if (f.path === sourcePath) {
        if (activeFilePath === f.path) setActiveFilePath(newPathBase);
        return { ...f, path: newPathBase };
      }
      
      // If it's a file inside a folder being moved
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

    // 1. Move/Rename
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

    // 2. Reorder
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
    setIsTransforming(true);
    try {
      const resp = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, polishDescription }),
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        const message = data.error || 'Polish failed';
        toast.error(message, { description: 'Try a shorter polish request or retry shortly.' });
        throw new Error(message);
      }

      const result = await resp.json();
      if (result.full) {
        const fullFiles = Array.isArray(result.files) ? result.files : [];
        if (fullFiles.length === 0) {
          console.error('Polish returned full=true but no files array');
          toast.error('Polish returned no files', { description: 'The server indicated a full replacement but provided no files.' });
        }
        setFiles(fullFiles);
        addToHistory(fullFiles);
        persistFiles(fullFiles);
      } else if (Array.isArray(result.files)) {
        const nextFiles = applyFileDelta(files, result.files, result.deletedPaths || []);
        setFiles(nextFiles);
        addToHistory(nextFiles);
        persistFiles(nextFiles);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTransforming(false);
    }
  };

  const downloadZip = async () => {
    setIsExporting(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      files.forEach(f => {
        zip.file(f.path, f.content);
      });
      
      // Generate README using AI
      let readmeContent = `# ${projectName}\n\n${initialPrompt}\n\n---\nMade by [Mini App Factory](https://github.com/Aditya190803/mini-app-factory)`;
      
      try {
        const response = await fetch('/api/generate/readme', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectName,
            prompt: initialPrompt,
            files: files.map(f => f.path)
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.content) {
            readmeContent = data.content;
          }
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
    } finally {
      setIsExporting(false);
    }
  };

  const startGithubConnect = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/integrations/github/start?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const startNetlifyConnect = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/integrations/netlify/start?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleHostedDeploy = async () => {
    if (!user) {
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

      await saveProject({
        projectName,
        prompt: initialPrompt,
        html: previewHtml, // Keep for legacy / thumbnails
        status: 'completed',
        userId: user.id,
        isPublished: true,
        isMultiPage: files.length > 1,
        pageCount: files.filter(f => f.fileType === 'page').length,
        deploymentUrl: resultsUrl,
        repoUrl: undefined,
        deployProvider: 'maf-hosted',
        deployedAt: Date.now(),
        netlifySiteName: undefined,
      });
      await publishProject({
        projectName,
        userId: user.id,
      });

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
      const message = err instanceof Error ? err.message : 'Publish failed';
      const normalized = normalizeDeployError(message);
      setDeployError(normalized);
      toast.error('Deploy failed', { description: normalized });
    } finally {
      setIsDeploying(false);
    }
  };

  const handleDeploy = async () => {
    if (!user) {
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
      const data = await performDeploy({
        projectName,
        prompt: initialPrompt,
        repoVisibility,
        githubOrg: githubOrg === 'personal' ? null : githubOrg,
        deployMode: deployOption,
        repoName: normalizedRepoName || projectName,
        repoFullName: linkedRepoFullName,
        netlifySiteName: deployOption === 'github-netlify' ? normalizedNetlifySiteName : undefined,
      }, (status) => {
        setDeployStatus(status);
      });
      setDeployResult({ repoUrl: data.repoUrl, deploymentUrl: data.deploymentUrl, netlifySiteName: data.netlifySiteName });
      await saveProject({
        projectName,
        prompt: initialPrompt,
        html: previewHtml,
        status: 'completed',
        userId: user.id,
        isPublished: projectData?.isPublished ?? false,
        isMultiPage: files.length > 1,
        pageCount: files.filter(f => f.fileType === 'page').length,
        deploymentUrl: data.deploymentUrl ?? undefined,
        repoUrl: data.repoUrl ?? undefined,
        deployProvider: deployOption === 'github-only' ? 'github' : 'netlify',
        deployedAt: Date.now(),
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
      const message = err instanceof Error ? err.message : 'Deploy failed';
      const normalized = normalizeDeployError(message);
      setDeployError(normalized);
      toast.error('Deploy failed', { description: normalized });
    } finally {
      setIsDeploying(false);
    }
  };


  const copyToClipboard = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setDeployNotice(`${label} copied to clipboard.`);
    } catch (err) {
      console.error(err);
      setDeployNotice(`Unable to copy ${label}.`);
    }
  };

  return (
    <motion.div
      className="flex flex-col h-screen"
      style={{ backgroundColor: 'var(--background)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <EditorHeader
        projectName={projectName}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onBack={onBack}
        saveStatus={saveStatus}
        onExport={downloadZip}
        onDeploy={() => setIsDeployDialogOpen(true)}
        isDeploying={isDeploying}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={undo}
        onRedo={redo}
        onHelp={() => setIsHelpDialogOpen(true)}
        onSettings={() => window.location.href = `/edit/${projectName}/settings`}
      />

      <div className="flex-1 flex overflow-hidden relative">
        {/* Toggle Explorer Button (Always visible) */}
        <button
          onClick={() => setIsExplorerVisible(!isExplorerVisible)}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-50 w-5 h-16 bg-[var(--background)] border border-[var(--border)] border-l-0 rounded-r flex items-center justify-center hover:bg-[var(--background-overlay)] transition-all shadow-md group",
            isExplorerVisible ? "left-[280px]" : "left-0"
          )}
          title={isExplorerVisible ? "Hide Explorer (Ctrl+B)" : "Show Explorer (Ctrl+B)"}
        >
          {isExplorerVisible ? (
            <ChevronLeft className="w-4 h-4 text-[var(--muted-text)] group-hover:text-[var(--primary)] transition-colors" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--primary)] group-hover:scale-110 transition-transform" />
          )}
        </button>

        <AnimatePresence>
          {isExplorerVisible && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden flex flex-col shrink-0"
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
        
        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'preview' && (
            <PreviewPanel 
              previewHtml={previewHtml} 
              files={files}
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

        <AnimatePresence>
          {isRightSidebarVisible && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="overflow-hidden flex flex-col shrink-0"
            >
              <EditorSidebar
                transformPrompt={transformPrompt}
                setTransformPrompt={setTransformPrompt}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                selectedElement={selectedElement}
                setSelectedElement={setSelectedElement}
                runTransform={runTransform}
                runPolish={() => setIsPolishDialogOpen(true)}
                isTransforming={isTransforming}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle Right Sidebar Button (Always visible) */}
        <button
          onClick={() => setIsRightSidebarVisible(!isRightSidebarVisible)}
          className={cn(
            "absolute top-1/2 -translate-y-1/2 z-50 w-5 h-16 bg-[var(--background)] border border-[var(--border)] border-r-0 rounded-l flex items-center justify-center hover:bg-[var(--background-overlay)] transition-all shadow-md group",
            isRightSidebarVisible ? "right-[320px]" : "right-0"
          )}
          title={isRightSidebarVisible ? "Hide AI Sidebar (Ctrl+I)" : "Show AI Sidebar (Ctrl+I)"}
        >
          {isRightSidebarVisible ? (
            <ChevronRight className="w-4 h-4 text-[var(--muted-text)] group-hover:text-[var(--primary)] transition-colors" />
          ) : (
            <ChevronLeft className="w-4 h-4 text-[var(--primary)] group-hover:scale-110 transition-transform" />
          )}
        </button>
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
              value={polishDescription}
              onChange={(e) => setPolishDescription(e.target.value)}
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
              <button
                type="button"
                onClick={() => setDeployOption('github-netlify')}
                className={cn(
                  "w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all",
                  deployOption === 'github-netlify'
                    ? "border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]"
                    : "border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]"
                )}
              >
                GitHub + Netlify (Recommended)
              </button>
              <button
                type="button"
                onClick={() => setDeployOption('github-only')}
                className={cn(
                  "w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all",
                  deployOption === 'github-only'
                    ? "border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]"
                    : "border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]"
                )}
              >
                GitHub Repo Only
              </button>
              <button
                type="button"
                onClick={() => setDeployOption('maf-hosted')}
                className={cn(
                  "w-full text-left border rounded-md px-3 py-2 font-mono text-xs transition-all",
                  deployOption === 'maf-hosted'
                    ? "border-[var(--primary)] text-[var(--foreground)] bg-[var(--background-overlay)]"
                    : "border-[var(--border)] text-[var(--muted-text)] hover:border-[var(--primary)]"
                )}
              >
                Deploy with us (Easiest and fastest)
              </button>
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
                <Button
                  onClick={startGithubConnect}
                  variant="outline"
                  className="font-mono uppercase text-[10px] border-[var(--border)]"
                >
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
                <Button
                  onClick={startNetlifyConnect}
                  variant="outline"
                  className="font-mono uppercase text-[10px] border-[var(--border)]"
                >
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
                      <option key={org} value={org}>{org}</option>
                    ))}
                  </select>
                  <div className="text-[10px] text-[var(--muted-text)] font-mono">
                    Select an org only if your OAuth app has access to it.
                  </div>
                </div>
              </>
            )}

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

            {deployResult?.repoUrl && (
              <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
                <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                  Repo: <span className="text-[var(--primary)]">{deployResult.repoUrl}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="font-mono uppercase text-[10px] border-[var(--border)]"
                    onClick={() => window.open(deployResult.repoUrl, '_blank')}
                  >
                    Open Repo
                  </Button>
                  <Button
                    variant="outline"
                    className="font-mono uppercase text-[10px] border-[var(--border)]"
                    onClick={() => copyToClipboard(deployResult.repoUrl!, 'Repo URL')}
                  >
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
                  <Button
                    variant="outline"
                    className="font-mono uppercase text-[10px] border-[var(--border)]"
                    onClick={() => window.open(deployResult.deploymentUrl, '_blank')}
                  >
                    Open Live URL
                  </Button>
                  <Button
                    variant="outline"
                    className="font-mono uppercase text-[10px] border-[var(--border)]"
                    onClick={() => copyToClipboard(deployResult.deploymentUrl!, 'Live URL')}
                  >
                    Copy Link
                  </Button>
                </div>
              </div>
            )}
            {deployResult?.netlifySiteName && (
              <div className="flex items-center justify-between gap-2 border border-[var(--border)] rounded-md px-3 py-2">
                <div className="text-[11px] text-[var(--secondary-text)] font-mono">
                  Netlify Site: <span className="text-[var(--primary)]">{deployResult.netlifySiteName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="font-mono uppercase text-[10px] border-[var(--border)]"
                    onClick={() => copyToClipboard(deployResult.netlifySiteName!, 'Netlify Site Name')}
                  >
                    Copy Name
                  </Button>
                </div>
              </div>
            )}
            {deployNotice && (
              <div className="text-[11px] text-[var(--muted-text)] font-mono">
                {deployNotice}
              </div>
            )}
            {deployError && (
              <div className="text-[11px] text-red-500 font-mono whitespace-pre-wrap">
                {deployError}
              </div>
            )}
            {isDeploying && deployStatus && (
              <div className="p-3 border border-[var(--border)] rounded-md bg-[var(--background-overlay)]/30 space-y-2 animate-in fade-in slide-in-from-bottom-2">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 bg-[var(--primary)] rounded-full animate-pulse" />
                  <span className="text-[10px] font-mono uppercase font-bold text-[var(--secondary-text)] tracking-wider">Deployment Status</span>
                </div>
                <div className="text-[12px] font-mono text-[var(--foreground)] pl-4 border-l-2 border-[var(--primary)]/30 py-1">
                  {deployStatus}
                </div>
              </div>
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
              disabled={
                isDeploying ||
                (deployOption === 'github-netlify' && (!integrationStatus.githubConnected || !integrationStatus.netlifyConnected)) ||
                (deployOption === 'github-only' && !integrationStatus.githubConnected) ||
                (deployOption !== 'maf-hosted' && (repoCheck.status === 'taken' || repoCheck.status === 'error' || !repoValidation.valid))
              }
              className="flex-1 bg-[var(--primary)] hover:bg-[var(--primary)]/90 text-[var(--primary-foreground)] font-mono uppercase text-[10px] font-black"
            >
              {isDeploying ? 'Deploying...' : deployOption === 'github-only' ? 'Create Repo' : 'Deploy Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isNewFileDialogOpen} onOpenChange={setIsNewFileDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight">
              New {newFileType === 'page' ? 'Page' : 'Partial'}
            </DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              {newFileType === 'page' 
                ? "Enter a name for the new page. High-level routes like 'pricing.html'." 
                : "Partials are reusable components (like navbars or buttons) that you can include in pages using <!-- include:filename.html -->."}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <input
              type="text"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder={newFileType === 'page' ? 'about.html' : 'navbar.html'}
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
                if (e.key === 'Enter' && filteredQuickOpenFiles.length > 0) {
                  setActiveFilePath(filteredQuickOpenFiles[0].path);
                  setIsQuickOpenOpen(false);
                }
              }}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto scrollbar-hide py-2">
            {filteredQuickOpenFiles.length > 0 ? (
              filteredQuickOpenFiles.map((file) => (
                <button
                  key={file.path}
                  className="w-full text-left px-4 py-3 hover:bg-[var(--background-overlay)] flex items-center gap-3 transition-colors group"
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
    </motion.div>
  );
}
