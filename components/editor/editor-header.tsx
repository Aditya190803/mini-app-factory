'use client';

import React from 'react';

interface EditorHeaderProps {
    projectName: string;
    activeTab: 'preview' | 'code' | 'split';
    setActiveTab: (tab: 'preview' | 'code' | 'split') => void;
    onBack: () => void;
    saveStatus: 'idle' | 'saving' | 'saved';
    onExport: () => void;
    onDeploy: () => void;
    isDeploying: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onHelp: () => void;
    onSettings: () => void;
}

export default function EditorHeader({
    projectName,
    activeTab,
    setActiveTab,
    onBack,
    saveStatus,
    onExport,
    onDeploy,
    isDeploying,
    canUndo,
    canRedo,
    onUndo,
    onRedo,
    onHelp,
    onSettings
}: EditorHeaderProps) {
    return (
        <header
            className="shrink-0 border-b flex flex-col"
            style={{
                backgroundColor: 'var(--background)',
                borderColor: 'var(--border)',
            }}
        >
            {/* Top bar: Navigation & Tabs */}
            <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-6">
                    <button
                        onClick={onBack}
                        className="text-xs font-mono uppercase font-bold tracking-widest hover:text-[var(--primary)] transition-colors"
                        style={{ color: 'var(--secondary-text)' }}
                    >
                        ← Back
                    </button>
                    <div className="flex items-center gap-1 border-l pl-6" style={{ borderColor: 'var(--border)' }}>
                        <button
                            onClick={() => setActiveTab('preview')}
                            className={`px-4 py-1.5 text-[10px] font-mono uppercase font-black transition-all ${activeTab === 'preview' ? 'bg-[var(--primary)] text-black' : 'text-[var(--secondary-text)] hover:text-white'
                                }`}
                        >
                            Preview
                        </button>
                        <button
                            onClick={() => setActiveTab('code')}
                            className={`px-4 py-1.5 text-[10px] font-mono uppercase font-black transition-all ${activeTab === 'code' ? 'bg-[var(--primary)] text-black' : 'text-[var(--secondary-text)] hover:text-white'
                                }`}
                        >
                            Code
                        </button>
                        <button
                            onClick={() => setActiveTab('split')}
                            className={`px-4 py-1.5 text-[10px] font-mono uppercase font-black transition-all ${activeTab === 'split' ? 'bg-[var(--primary)] text-black' : 'text-[var(--secondary-text)] hover:text-white'
                                }`}
                        >
                            Split
                        </button>
                    </div>

                    <div className="flex items-center gap-2 border-l pl-6" style={{ borderColor: 'var(--border)' }}>
                        <button
                            onClick={onUndo}
                            disabled={!canUndo}
                            className="p-1.5 text-[var(--secondary-text)] hover:text-[var(--primary)] disabled:opacity-30 disabled:hover:text-[var(--secondary-text)]"
                            title="Undo"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
                        </button>
                        <button
                            onClick={onRedo}
                            disabled={!canRedo}
                            className="p-1.5 text-[var(--secondary-text)] hover:text-[var(--primary)] disabled:opacity-30 disabled:hover:text-[var(--secondary-text)]"
                            title="Redo"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" /></svg>
                        </button>
                    </div>

                    <div className="flex items-center gap-1 border-l pl-6" style={{ borderColor: 'var(--border)' }}>
                        <button
                            onClick={onHelp}
                            className="text-[10px] font-mono uppercase font-bold text-[var(--muted-text)] hover:text-[var(--primary)] transition-colors flex items-center gap-1.5"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" x2="12.01" y1="17" y2="17" /></svg>
                            Help
                        </button>
                    </div>

                    <div className="flex items-center gap-1 border-l pl-6" style={{ borderColor: 'var(--border)' }}>
                        <button
                            onClick={onSettings}
                            className="text-[10px] font-mono uppercase font-bold text-[var(--muted-text)] hover:text-[var(--primary)] transition-colors flex items-center gap-1.5"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1l2.5 4.5L19 7l-4.5 2.5L12 14l-2.5-4.5L5 7l4.5-1.5L12 1z"/><path d="M4 14l2 3.5L9.5 19l-3.5 2L4 24"/><path d="M20 14l-2 3.5L14.5 19l3.5 2L20 24"/></svg>
                            Settings
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[var(--muted-text)] uppercase tracking-widest hidden sm:block">
                        Fabricating:
                    </span>
                    <span className="text-[10px] font-display font-black uppercase tracking-[0.2em]" style={{ color: 'var(--foreground)' }}>
                        {projectName}
                    </span>
                </div>
            </div>

            {/* Action bar: Status & Controls */}
            <div className="flex items-center justify-end px-4 py-2 bg-[var(--background-surface)] gap-4">
                <div className="flex-1 flex items-center gap-3">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${saveStatus === 'saving' ? 'bg-yellow-500 animate-pulse' : 'bg-[var(--primary)]'}`} />
                        <span className="text-[9px] font-mono uppercase text-[var(--muted-text)]">
                            {saveStatus === 'saving' ? 'Syncing to cloud...' : saveStatus === 'saved' ? 'All changes saved' : 'System Online'}
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={onExport}
                        className="px-4 py-1.5 text-[10px] font-mono uppercase font-bold text-[var(--secondary-text)] border border-[var(--border)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-all"
                    >
                        Export ZIP
                    </button>
                    <button
                        onClick={onDeploy}
                        disabled={isDeploying}
                        className="flex items-center gap-2 px-4 py-1.5 text-[10px] font-mono uppercase font-bold border border-[var(--primary)] text-[var(--primary)] hover:bg-[var(--primary)] hover:text-black transition-all disabled:opacity-50"
                    >
                        {isDeploying && <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>}
                        {isDeploying ? 'Deploying' : 'Deploy'}
                    </button>
                </div>
            </div>
        </header>
    );
}
