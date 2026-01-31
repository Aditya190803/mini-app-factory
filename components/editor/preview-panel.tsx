'use client';

import React, { useState } from 'react';

interface PreviewPanelProps {
    previewHtml: string;
}

type ViewportMode = 'desktop' | 'tablet' | 'mobile';

export default function PreviewPanel({ previewHtml }: PreviewPanelProps) {
    const [mode, setMode] = useState<ViewportMode>('desktop');
    const [refreshKey, setRefreshKey] = useState(0);

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
                    <span className="text-[9px] font-mono text-[var(--muted-text)] uppercase">{mode === 'desktop' ? 'Responsive' : mode === 'tablet' ? '768px' : '375px'}</span>
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
                        srcDoc={previewHtml}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                        title="Website Preview"
                    />
                </div>
            </div>
        </div>
    );
}
