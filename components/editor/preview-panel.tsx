'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ProjectFile } from '@/lib/page-builder';

interface PreviewPanelProps {
    previewHtml: string;
    files: ProjectFile[];
    onOpenInEditor?: (path: string, elementHtml?: string) => void;
    onAttachToChat?: (path: string, html: string) => void;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

export default function PreviewPanel({ previewHtml, files, onOpenInEditor, onAttachToChat }: PreviewPanelProps) {
    const [mode, setMode] = useState<ViewportMode>('desktop');
    const [refreshKey, setRefreshKey] = useState(0);
    const [isSelectorActive, setIsSelectorActive] = useState(false);
    const [selectionMenu, setSelectionMenu] = useState<{ x: number, y: number, path: string, html: string } | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const lastFilesRef = useRef<ProjectFile[]>(files);
    
    // CSS HMR Logic
    useEffect(() => {
        const changedFiles = files.filter((f, i) => f.content !== lastFilesRef.current[i]?.content);
        const onlyStylesChanged = changedFiles.length > 0 && changedFiles.every(f => f.fileType === 'style');

        if (onlyStylesChanged && iframeRef.current?.contentWindow) {
            changedFiles.forEach(styleFile => {
                iframeRef.current?.contentWindow?.postMessage({
                    type: 'update-css',
                    file: styleFile.path,
                    content: styleFile.content
                }, '*');
            });
            lastFilesRef.current = files;
            return; // Prevent full reload if only styles changed
        }

        lastFilesRef.current = files;
    }, [files]);

    // Visual Selector messaging
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'element-selected') {
                const { path, elementHtml, x, y } = event.data;
                
                // Convert iframe coordinates to parent coordinates
                if (iframeRef.current) {
                    const rect = iframeRef.current.getBoundingClientRect();
                    setSelectionMenu({
                        x: rect.left + x,
                        y: rect.top + y,
                        path,
                        html: elementHtml
                    });
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    useEffect(() => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
                type: 'toggle-selector',
                active: isSelectorActive
            }, '*');
        }
        if (!isSelectorActive) setSelectionMenu(null);
    }, [isSelectorActive]);

    useEffect(() => {
        const handleOutsideClick = (e: MouseEvent) => {
            if (selectionMenu && !(e.target as HTMLElement).closest('.selection-menu')) {
                setSelectionMenu(null);
            }
        };
        window.addEventListener('mousedown', handleOutsideClick);
        return () => window.removeEventListener('mousedown', handleOutsideClick);
    }, [selectionMenu]);

    const handleAction = (action: 'open' | 'attach') => {
        if (!selectionMenu) return;
        
        if (action === 'open') {
            onOpenInEditor?.(selectionMenu.path, selectionMenu.html);
        } else {
            onAttachToChat?.(selectionMenu.path, selectionMenu.html);
        }
        
        setSelectionMenu(null);
        setIsSelectorActive(false);
    };

    const getWidth = () => {
        switch (mode) {
            case 'mobile': return '375px';
            case 'tablet': return '768px';
            default: return '100%';
        }
    };

    return (
        <div className="w-full h-full bg-[#1a1a1a] flex flex-col overflow-hidden">
            {/* Mini-toolbar for preview */}
            <div className="flex items-center justify-between px-4 py-2 bg-[var(--background-surface)] border-b border-[var(--border)]">
                <div className="flex items-center gap-1 bg-[var(--background)] p-0.5 border border-[var(--border)]">
                    <button
                        onClick={() => setMode('desktop')}
                        className={`p-1.5 transition-colors ${mode === 'desktop' ? 'text-[var(--primary)] bg-[var(--background-surface)]' : 'text-[var(--muted-text)] hover:text-white'}`}
                        title="Desktop view"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2" /><line x1="8" x2="16" y1="21" y2="21" /><line x1="12" x2="12" y1="17" y2="21" /></svg>
                    </button>
                    <button
                        onClick={() => setMode('tablet')}
                        className={`p-1.5 transition-colors ${mode === 'tablet' ? 'text-[var(--primary)] bg-[var(--background-surface)]' : 'text-[var(--muted-text)] hover:text-white'}`}
                        title="Tablet view"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="20" x="4" y="2" rx="2" ry="2" /><line x1="12" x2="12.01" y1="18" y2="18" /></svg>
                    </button>
                    <button
                        onClick={() => setMode('mobile')}
                        className={`p-1.5 transition-colors ${mode === 'mobile' ? 'text-[var(--primary)] bg-[var(--background-surface)]' : 'text-[var(--muted-text)] hover:text-white'}`}
                        title="Mobile view"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="10" height="18" x="7" y="3" rx="2" ry="2" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsSelectorActive(!isSelectorActive)}
                        className={`p-1.5 transition-colors ${isSelectorActive ? 'text-[var(--primary)] bg-[var(--background-surface)]' : 'text-[var(--muted-text)] hover:text-white'}`}
                        title="Visual Selector"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 12V4H12" />
                            <path d="M20 12V20H12" />
                            <circle cx="12" cy="12" r="3" />
                        </svg>
                    </button>
                    <button
                        onClick={() => setRefreshKey(k => k + 1)}
                        className="p-1 text-[var(--muted-text)] hover:text-[var(--primary)] transition-colors"
                        title="Refresh preview"
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 21v-5h5" /></svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                <div
                    className="h-full bg-white shadow-2xl transition-all duration-300 ease-in-out"
                    style={{ width: getWidth(), minHeight: mode !== 'desktop' ? '600px' : 'auto' }}
                >
                    <iframe
                        key={refreshKey}
                        ref={iframeRef}
                        srcDoc={previewHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"
                        title="Website Preview"
                        onLoad={() => {
                            if (isSelectorActive && iframeRef.current?.contentWindow) {
                                iframeRef.current.contentWindow.postMessage({
                                    type: 'toggle-selector',
                                    active: true
                                }, '*');
                            }
                        }}
                    />
                </div>
            </div>

            {selectionMenu && (
                <div 
                    className="selection-menu fixed z-[9999] bg-[var(--background-surface)] border border-[var(--border)] shadow-xl rounded-md overflow-hidden min-w-[160px] animate-in fade-in zoom-in duration-200"
                    style={{ left: selectionMenu.x, top: selectionMenu.y }}
                >
                    <div className="px-3 py-2 border-b border-[var(--border)] bg-[var(--background)]">
                        <span className="text-[9px] uppercase font-black text-[var(--muted-text)] tracking-wider">Element Selected</span>
                    </div>
                    <button
                        onClick={() => handleAction('open')}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--primary)]/10 text-[var(--foreground)] flex items-center gap-2 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z"/></svg>
                        Open in Editor
                    </button>
                    <button
                        onClick={() => handleAction('attach')}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--primary)]/10 text-[var(--foreground)] flex items-center gap-2 transition-colors"
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                        Attach to Chat
                    </button>
                    <button
                        onClick={() => setSelectionMenu(null)}
                        className="w-full text-left px-3 py-1.5 text-[10px] hover:bg-red-500/10 text-red-400 border-t border-[var(--border)] transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}
