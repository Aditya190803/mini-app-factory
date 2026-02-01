'use client';

import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
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
import { Spinner } from '@/components/ui/spinner';
import { ProjectFile, assembleFullPage } from '@/lib/page-builder';
import { migrateProject } from '@/lib/migration';

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

export default function EditorWorkspace({ initialHTML, initialPrompt, projectName, onBack }: EditorWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'split'>('preview');
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('index.html');
  const [transformPrompt, setTransformPrompt] = useState('');
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
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
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ path: string, type: 'file' | 'folder' } | null>(null);
  const [polishDescription, setPolishDescription] = useState('images, typography, animations, mobile responsiveness');

  // Global history for files
  const [history, setHistory] = useState<ProjectFile[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const user = useUser();
  const saveProject = useMutation(api.projects.saveProject);
  const saveFilesAction = useMutation(api.files.saveFiles);
  const publishProject = useMutation(api.projects.publishProject);
  const projectData = useQuery(api.projects.getProject, { projectName });
  const projectFiles = useQuery(api.files.getFilesByProject, 
    projectData?._id ? { projectId: projectData._id } : "skip"
  );

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
    if (projectFiles && files.length === 0) {
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
      }
    }
  }, [projectFiles, initialHTML, projectData?._id, files.length, saveFilesAction, saveProject, projectName, initialPrompt, user?.id]);

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
    
    const assembledHtml = assembleFullPage(
      activeFilePath.endsWith('.html') ? activeFilePath : 'index.html', 
      files,
      projectName
    );

    const script = `
      <script>
        document.addEventListener('click', (e) => {
          const a = e.target.closest('a');
          if (a) {
            const href = a.getAttribute('href');
            if (href && href.startsWith('#')) {
              e.preventDefault();
              const target = document.querySelector(href);
              if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
                history.pushState(null, null, href);
              }
            } else if (href && !href.startsWith('javascript:') && !href.startsWith('http') && !href.startsWith('mailto:')) {
              e.preventDefault();
              window.parent.postMessage({ type: 'navigate', path: href }, '*');
            } else if (href && href.startsWith('http')) {
              e.preventDefault();
              window.open(a.href, '_blank');
            }
          }
        });
      </script>
    `;

    if (/<head[^>]*>/i.test(assembledHtml)) {
      return assembledHtml.replace(/<head[^>]*>/i, (match) => `${match}\n    ${script}`);
    }
    return `${script}${assembledHtml}`;
  }, [files, activeFilePath]);

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

  // Auto-save to Convex
  useEffect(() => {
    if (!user || !files.length || !projectData?._id) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveFilesAction({
          projectId: projectData._id,
          files: files
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Auto-save failed', err);
        setSaveStatus('idle');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [files, user, projectData?._id, saveFilesAction]);

  const runTransform = async () => {
    if (!transformPrompt.trim()) return;
    setIsTransforming(true);
    try {
      const response = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          files, 
          activeFile: activeFilePath,
          prompt: transformPrompt 
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Transform failed');
      }

      // Transition to streaming multi-file parser
      // For now, assume it returns full files
      const result = await response.json();
      if (result.files) {
        setFiles(result.files);
        addToHistory(result.files);
      }
      setTransformPrompt('');
    } catch (err) {
      console.error('Transform error', err);
      alert(err instanceof Error ? err.message : 'Transform failed');
    } finally {
      setIsTransforming(false);
    }
  };

  const handleNewFile = (type: ProjectFile['fileType']) => {
    setNewFileType(type);
    setNewFileName('');
    setIsNewFileDialogOpen(true);
  };

  const confirmNewFile = () => {
    if (!newFileName) return;
    
    if (files.some(f => f.path === newFileName)) {
      alert('File already exists');
      return;
    }

    const lang: ProjectFile['language'] = newFileName.endsWith('.css') ? 'css' : newFileName.endsWith('.js') ? 'javascript' : 'html';
    const newFile: ProjectFile = {
      path: newFileName,
      content: '', // Template could be added here
      language: lang,
      fileType: newFileType as ProjectFile['fileType']
    };

    setFiles(prev => {
      const next = [...prev, newFile];
      addToHistory(next);
      return next;
    });
    setActiveFilePath(newFileName);
    setIsNewFileDialogOpen(false);
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

    setFiles(prev => {
      const next = [...prev, newFile];
      addToHistory(next);
      return next;
    });
    setIsNewFolderDialogOpen(false);
  };

  const handleDeleteItem = (path: string, type: 'file' | 'folder') => {
    setItemToDelete({ path, type });
    setIsDeleteDialogOpen(true);
  };

  const confirmDeleteItem = async () => {
    if (!itemToDelete) return;
    const { path, type } = itemToDelete;
    
    setFiles(prev => {
      let next;
      if (type === 'file') {
        next = prev.filter(f => f.path !== path);
      } else {
        // Folder deletion: remove all files starting with "path/"
        const prefix = path.endsWith('/') ? path : `${path}/`;
        next = prev.filter(f => !f.path.startsWith(prefix));
      }
      
      addToHistory(next);
      return next;
    });

    if (type === 'file' && activeFilePath === path) {
      setActiveFilePath('index.html');
    } else if (type === 'folder' && activeFilePath?.startsWith(path.endsWith('/') ? path : `${path}/`)) {
      setActiveFilePath('index.html');
    }

    setIsDeleteDialogOpen(false);
    setItemToDelete(null);
  };

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

    setFiles(prev => {
      const next = prev.map(f => {
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
      addToHistory(next);
      return next;
    });

    setIsRenameDialogOpen(false);
    setItemToRename(null);
  };

  const handleMoveItem = (sourcePath: string, destFolderPath: string) => {
    // If destination is same as source, skip
    if (sourcePath === destFolderPath) return;

    setFiles(prev => {
      const sourceName = sourcePath.split('/').pop()!;
      const targetDir = destFolderPath.endsWith('/') ? destFolderPath : `${destFolderPath}/`;
      const newPathBase = `${targetDir}${sourceName}`;

      // Check for collisions
      if (prev.some(f => f.path === newPathBase)) {
         alert(`An item named "${sourceName}" already exists in "${destFolderPath}"`);
         return prev;
      }

      const next = prev.map(f => {
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

      addToHistory(next);
      return next;
    });
  };

  const handleMoveAndReorder = (sourcePath: string, destFolderPath: string, targetPath: string) => {
    setFiles(prev => {
      const sourceName = sourcePath.split('/').pop()!;
      const targetDir = destFolderPath.endsWith('/') ? destFolderPath : `${destFolderPath}/`;
      const newPathBase = `${targetDir}${sourceName}`;

      // 1. Move/Rename
      const movedFiles = prev.map(f => {
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
      
      addToHistory(result);
      return result;
    });
  };

  const handleReorderFiles = (sourcePath: string, destinationPath: string) => {
    setFiles(prev => {
      const result = [...prev];
      const sourceIndex = result.findIndex(f => f.path === sourcePath);
      const destIndex = result.findIndex(f => f.path === destinationPath);
      
      if (sourceIndex === -1 || destIndex === -1) return prev;
      
      const [removed] = result.splice(sourceIndex, 1);
      result.splice(destIndex, 0, removed);
      
      addToHistory(result);
      return result;
    });
  };

  const onPolishSubmit = async () => {
    setIsPolishDialogOpen(false);
    setIsTransforming(true);
    try {
      const resp = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files, polishDescription }),
      });
      if (!resp.ok) throw new Error('Polish failed');

      const result = await resp.json();
      if (result.files) {
        setFiles(result.files);
        addToHistory(result.files);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTransforming(false);
    }
  };

  const handlePublish = async () => {
    if (!user) {
      window.location.href = '/handler/sign-in';
      return;
    }

    setIsPublishing(true);
    try {
      await saveProject({
        projectName,
        prompt: initialPrompt,
        html: previewHtml, // Keep for legacy / thumbnails
        status: 'completed',
        userId: user.id,
        isPublished: true,
        isMultiPage: files.length > 1,
        pageCount: files.filter(f => f.fileType === 'page').length
      });
      await publishProject({
        projectName,
        userId: user.id,
      });
      window.open(`/results/${projectName}`, '_blank');
    } catch (err) {
      console.error('Publish failed', err);
      alert('Failed to publish project');
    } finally {
      setIsPublishing(false);
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
        onPublish={handlePublish}
        isPublishing={isPublishing}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={undo}
        onRedo={redo}
        onHelp={() => setIsHelpDialogOpen(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <FileTree 
          files={files} 
          activeFilePath={activeFilePath} 
          onFileSelect={setActiveFilePath}
          onNewFile={handleNewFile}
          onNewFolder={handleNewFolder}
          onDeleteItem={handleDeleteItem}
          onRenameItem={handleRenameItem}
          onMoveItem={handleMoveItem}
          onMoveAndReorder={handleMoveAndReorder}
          onReorderFiles={handleReorderFiles}
        />
        
        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'preview' && (
            <PreviewPanel previewHtml={previewHtml} />
          )}

          {activeTab === 'code' && activeFile && (
            <CodePanel
              html={activeFile.content}
              language={activeFile.language}
              onChange={handleEditorChange}
              onReset={handleReset}
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
                <PreviewPanel previewHtml={previewHtml} />
              </div>
            </div>
          )}
        </main>

        <EditorSidebar
          transformPrompt={transformPrompt}
          setTransformPrompt={setTransformPrompt}
          runTransform={runTransform}
          runPolish={() => setIsPolishDialogOpen(true)}
          isTransforming={isTransforming}
        />
      </div>

      <Dialog open={isPolishDialogOpen} onOpenChange={setIsPolishDialogOpen}>
        <DialogContent className="sm:max-w-[425px] bg-[var(--background)] border-[var(--border)] text-[var(--foreground)]">
          <DialogHeader>
            <DialogTitle className="font-mono uppercase text-sm tracking-tight">Polish Site</DialogTitle>
            <DialogDescription className="text-xs text-[var(--muted-text)] font-mono">
              Describe how to polish this site (images, typography, animations, mobile responsiveness).
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
                      <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-red-500 font-bold uppercase text-[10px]">
                        Warning: This folder contains files. All of them will be permanently deleted.
                      </div>
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
    </motion.div>
  );
}
