'use client';

import React from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { html as htmlLang } from '@codemirror/lang-html';

interface CodePanelProps {
    html: string;
    onChange: (val: string) => void;
    onReset: () => void;
    initialHTML: string;
}

export default function CodePanel({ html, onChange, onReset, initialHTML }: CodePanelProps) {
    return (
        <div className="w-full h-full flex flex-col overflow-hidden relative" style={{ backgroundColor: 'var(--background-surface)' }}>
            <div className="absolute top-4 right-8 z-10 flex gap-2">
                <button
                    onClick={() => {
                        navigator.clipboard.writeText(html);
                    }}
                    className="px-3 py-1 text-[9px] font-mono uppercase font-black bg-[var(--background)] border border-[var(--border)] text-[var(--secondary-text)] hover:text-[var(--primary)] hover:border-[var(--primary)] transition-all flex items-center gap-1.5"
                >
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>
                    Copy
                </button>
                <button
                    onClick={() => {
                        if (confirm('Reset to initial version? All manual changes will be lost.')) {
                            onReset();
                        }
                    }}
                    className="px-3 py-1 text-[9px] font-mono uppercase font-black bg-[var(--background)] border border-[var(--border)] text-[var(--secondary-text)] hover:text-[var(--error)] hover:border-[var(--error)] transition-all flex items-center gap-1.5"
                >
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                    Reset
                </button>
            </div>
            <div className="flex-1 overflow-auto pt-0">
                <CodeMirror
                    value={html}
                    height="100%"
                    extensions={[htmlLang()]}
                    onChange={(value) => onChange(value)}
                    basicSetup={{
                        highlightActiveLine: true,
                        lineNumbers: true,
                        foldGutter: true,
                        highlightActiveLineGutter: true,
                    }}
                    theme="dark"
                    style={{ height: '100%', fontSize: '12px' }}
                />
            </div>
        </div>
    );
}
