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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isPolishDialogOpen, setIsPolishDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [polishDescription, setPolishDescription] = useState('images, typography, animations, mobile responsiveness');

  // Global history for files
  const [history, setHistory] = useState<ProjectFile[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const user = useUser();
  const saveProject = useMutation(api.projects.saveProject);
  const saveFilesAction = useMutation(api.files.saveFiles);
  const deleteFileAction = useMutation(api.files.deleteFile);
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
    if (history.length > 0) {
      setFiles(history[0]);
      setHistoryIndex(0);
    }
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
    const name = prompt(`Name for new ${type} (e.g. about.html):`);
    if (!name) return;
    
    if (files.some(f => f.path === name)) {
      alert('File already exists');
      return;
    }

    const lang: ProjectFile['language'] = name.endsWith('.css') ? 'css' : name.endsWith('.js') ? 'javascript' : 'html';
    const newFile: ProjectFile = {
      path: name,
      content: '', // Template could be added here
      language: lang,
      fileType: type
    };

    setFiles(prev => {
      const next = [...prev, newFile];
      addToHistory(next);
      return next;
    });
    setActiveFilePath(name);
  };

  const handleDeleteFile = async (path: string) => {
    if (!confirm(`Delete ${path}?`)) return;
    
    setFiles(prev => {
      const next = prev.filter(f => f.path !== path);
      addToHistory(next);
      return next;
    });
    if (activeFilePath === path) {
      setActiveFilePath('index.html');
    }

    if (projectData?._id) {
      await deleteFileAction({ projectId: projectData._id, path });
    }
  };

  const handleReorderFiles = (startIndex: number, endIndex: number) => {
    setFiles(prev => {
      const result = [...prev];
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      
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
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      files.forEach(f => {
        zip.file(f.path, f.content);
      });
      zip.file('README.txt', 'Generated by Mini App Factory');
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
          onDeleteFile={handleDeleteFile}
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
    </motion.div>
  );
}
