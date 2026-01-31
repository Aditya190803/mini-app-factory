'use client';

import React from 'react';

interface EditorSidebarProps {
    transformPrompt: string;
    setTransformPrompt: (val: string) => void;
    runTransform: () => void;
    runPolish: () => void;
    isTransforming: boolean;
}

export default function EditorSidebar({
    transformPrompt,
    setTransformPrompt,
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
                <textarea
                    value={transformPrompt}
                    onChange={(e) => setTransformPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe changes... (e.g., 'Make the hero purple and add a signup modal') [Ctrl+Enter to apply]"
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
