'use client';

import React from 'react';

interface EditorSidebarProps {
    transformPrompt: string;
    setTransformPrompt: (val: string) => void;
    selectedElement: { path: string, html: string } | null;
    setSelectedElement: (val: { path: string, html: string } | null) => void;
    runTransform: () => void;
    runPolish: () => void;
    isTransforming: boolean;
}

export default function EditorSidebar({
    transformPrompt,
    setTransformPrompt,
    selectedElement,
    setSelectedElement,
    runTransform,
    runPolish,
    isTransforming
}: EditorSidebarProps) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!isTransforming && transformPrompt.trim()) {
                runTransform();
            }
        }
    };

    // Helper to get a human-readable tag info for the badge
    const getElementBadgeInfo = () => {
        if (!selectedElement) return null;
        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(selectedElement.html, 'text/html');
            const el = doc.body.firstElementChild;
            if (!el) return selectedElement.path;
            
            const tag = el.tagName.toLowerCase();
            const classes = Array.from(el.classList).join('.');
            const className = classes ? `.${classes.split(' ').slice(0, 2).join('.')}` : '';
            return `<${tag}${className}> in ${selectedElement.path}`;
        } catch (e) {
            return selectedElement.path;
        }
    };

    return (
        <aside
            className="w-80 border-l flex flex-col overflow-hidden shrink-0"
            style={{
                backgroundColor: 'var(--background-surface)',
                borderColor: 'var(--border)',
            }}
        >
            {/* Transform Section */}
            <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
                <h3
                    className="text-[10px] font-mono uppercase font-black tracking-[0.2em] mb-4"
                    style={{ color: 'var(--secondary-text)' }}
                >
                    Transform with AI
                </h3>

                {selectedElement && (
                    <div className="mb-3 p-2 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded flex items-center justify-between group">
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-[9px] uppercase font-black text-[var(--primary)] tracking-wider">Targeting Element</span>
                            <span className="text-[10px] font-mono text-[var(--foreground)] truncate pr-2">
                                {getElementBadgeInfo()}
                            </span>
                        </div>
                        <button 
                            onClick={() => setSelectedElement(null)}
                            className="p-1 hover:bg-[var(--primary)]/20 rounded text-[var(--muted-text)] hover:text-[var(--primary)] transition-colors"
                            title="Clear selection"
                        >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>
                )}

                <textarea
                    value={transformPrompt}
                    onChange={(e) => setTransformPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={selectedElement ? "Describe changes for this element..." : "Describe changes... (e.g., 'Make the hero purple') [Ctrl+Enter]"}
                    className="w-full h-32 resize-none text-xs p-3 border bg-[var(--background)] focus:outline-none focus:border-[var(--primary)] transition-colors font-mono leading-relaxed"
                    style={{
                        borderColor: 'var(--border)',
                        color: 'var(--foreground)',
                    }}
                />
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={runTransform}
                        disabled={isTransforming || !transformPrompt.trim()}
                        className="flex-1 px-3 py-2 text-[10px] font-mono uppercase font-black flex items-center justify-center gap-2 transition-all"
                        style={{
                            backgroundColor:
                                isTransforming || !transformPrompt.trim() ? 'var(--background)' : 'var(--primary)',
                            color:
                                isTransforming || !transformPrompt.trim()
                                    ? 'var(--muted-text)'
                                    : 'var(--primary-foreground)',
                            borderColor:
                                isTransforming || !transformPrompt.trim() ? 'var(--border)' : 'var(--primary)',
                            borderWidth: '1px',
                            cursor: isTransforming || !transformPrompt.trim() ? 'not-allowed' : 'pointer',
                        }}
                    >
                        {isTransforming ? (
                            <>
                                <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    />
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    />
                                </svg>
                                Apply
                            </>
                        ) : (
                            'Apply'
                        )}
                    </button>
                    <button
                        onClick={runPolish}
                        disabled={isTransforming}
                        className="px-4 py-2 text-[10px] font-mono uppercase font-black border border-[var(--border)] hover:border-white transition-all"
                        style={{
                            color: 'var(--foreground)',
                        }}
                    >
                        Polish
                    </button>
                </div>
            </div>
        </aside>
    );
}
