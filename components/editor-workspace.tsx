'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
import { stripCodeFence } from '@/lib/utils';

import EditorHeader from './editor/editor-header';
import EditorSidebar from './editor/editor-sidebar';
import PreviewPanel from './editor/preview-panel';
import CodePanel from './editor/code-panel';

interface EditorWorkspaceProps {
  initialHTML: string;
  initialPrompt: string;
  projectName: string;
  onBack: () => void;
}

export default function EditorWorkspace({ initialHTML, initialPrompt, projectName, onBack }: EditorWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'split'>('preview');
  const [editableHtml, setEditableHtml] = useState(initialHTML);
  const [transformPrompt, setTransformPrompt] = useState('');
  const [isTransforming, setIsTransforming] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isPolishDialogOpen, setIsPolishDialogOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [polishDescription, setPolishDescription] = useState('images, typography, animations, mobile responsiveness');

  // History State
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const user = useUser();
  const saveProject = useMutation(api.projects.saveProject);
  const publishProject = useMutation(api.projects.publishProject);
  const projectData = useQuery(api.projects.getProject, { projectName });

  // Initialize history
  useEffect(() => {
    if (initialHTML && history.length === 0) {
      setHistory([initialHTML]);
      setHistoryIndex(0);
      setEditableHtml(initialHTML);
    }
  }, [initialHTML, history.length]);

  const addToHistory = useCallback((html: string) => {
    setHistory(prev => {
      const next = prev.slice(0, historyIndex + 1);
      next.push(html);
      return next;
    });
    setHistoryIndex(prev => prev + 1);
  }, [historyIndex]);

  const undo = () => {
    if (historyIndex > 0) {
      const prevHtml = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setEditableHtml(prevHtml);
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextHtml = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setEditableHtml(nextHtml);
    }
  };

  // Auto-save to Convex
  useEffect(() => {
    if (!user || !editableHtml) return;

    const timer = setTimeout(async () => {
      setSaveStatus('saving');
      try {
        await saveProject({
          projectName,
          prompt: initialPrompt,
          html: editableHtml,
          status: 'completed',
          userId: user.id,
          isPublished: projectData?.isPublished ?? false,
        });
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Auto-save failed', err);
        setSaveStatus('idle');
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [editableHtml, user, projectName, initialPrompt, saveProject, projectData?.isPublished]);

  const previewHtml = useMemo(() => {
    if (!editableHtml) return '';
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
            } else if (href && !href.startsWith('javascript:')) {
              e.preventDefault();
              window.open(a.href, '_blank');
            }
          }
        });
      </script>
    `;

    if (/<head[^>]*>/i.test(editableHtml)) {
      return editableHtml.replace(/<head[^>]*>/i, (match) => `${match}\n    ${script}`);
    }
    if (/<body[^>]*>/i.test(editableHtml)) {
      return editableHtml.replace(/<body[^>]*>/i, (match) => `${match}\n    ${script}`);
    }
    return `${script}${editableHtml}`;
  }, [editableHtml]);

  const downloadZip = async () => {
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      zip.file('index.html', editableHtml);
      zip.file('README.txt', 'Generated by Mini App Factory');
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'site.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Zip failed', err);
    }
  };

  const runTransform = async () => {
    if (!transformPrompt.trim()) return;
    setIsTransforming(true);
    try {
      const response = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: editableHtml, prompt: transformPrompt }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Transform failed');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      let streamedHtml = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamedHtml += chunk;
        setEditableHtml(streamedHtml);
      }

      const finalHtml = stripCodeFence(streamedHtml);
      setEditableHtml(finalHtml);
      addToHistory(finalHtml);
      setTransformPrompt('');
    } catch (err) {
      console.error('Transform error', err);
      alert(err instanceof Error ? err.message : 'Transform failed');
    } finally {
      setIsTransforming(false);
    }
  };

  const onPolishSubmit = async () => {
    setIsPolishDialogOpen(false);
    setIsTransforming(true);
    try {
      const resp = await fetch('/api/transform', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: editableHtml, polishDescription }),
      });
      if (!resp.ok) throw new Error('Polish failed');

      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      let streamedHtml = '';
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        streamedHtml += chunk;
        setEditableHtml(streamedHtml);
      }

      const finalHtml = stripCodeFence(streamedHtml);
      setEditableHtml(finalHtml);
      addToHistory(finalHtml);
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
        html: editableHtml,
        status: 'completed',
        userId: user.id,
        isPublished: true,
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

  const handleEditorChange = (value: string) => {
    setEditableHtml(value);
    // We don't add to history on every keystroke to avoid cluttering the stack
    // Maybe we could add a debounced version if needed
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
        <main className="flex-1 flex overflow-hidden">
          {activeTab === 'preview' && (
            <PreviewPanel previewHtml={previewHtml} />
          )}

          {activeTab === 'code' && (
            <CodePanel
              html={editableHtml}
              onChange={handleEditorChange}
              onReset={() => {
                setEditableHtml(initialHTML);
                addToHistory(initialHTML);
              }}
              initialHTML={initialHTML}
            />
          )}

          {activeTab === 'split' && (
            <div className="flex-1 flex">
              <div className="flex-1 border-r border-[var(--border)] overflow-hidden">
                <CodePanel
                  html={editableHtml}
                  onChange={handleEditorChange}
                  onReset={() => {
                    setEditableHtml(initialHTML);
                    addToHistory(initialHTML);
                  }}
                  initialHTML={initialHTML}
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
