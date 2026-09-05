'use client';

import {
    ArrowLeft,
    Code2,
    Download,
    FileText,
    HelpCircle,
    Library,
    MessageSquare,
    Monitor,
    Redo2,
    Rocket,
    Settings,
    Undo2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorHeaderProps {
    projectName: string;
    activeTab: 'preview' | 'code' | 'split';
    setActiveTab: (tab: 'preview' | 'code' | 'split') => void;
    onBack: () => void;
    saveStatus: 'idle' | 'saving' | 'saved' | 'conflict';
    onExport: () => void;
    onDeploy: () => void;
    isDeploying: boolean;
    canUndo: boolean;
    canRedo: boolean;
    onUndo: () => void;
    onRedo: () => void;
    onHelp: () => void;
    onLibrary: () => void;
    onSettings: () => void;
    isExplorerVisible: boolean;
    onToggleExplorer: () => void;
    isChatVisible: boolean;
    onToggleChat: () => void;
}

const viewTabs = [
    { value: 'preview' as const, label: 'Preview', icon: Monitor },
    { value: 'code' as const, label: 'Code', icon: Code2 },
    { value: 'split' as const, label: 'Split', icon: FileText },
];

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
    onLibrary,
    onSettings,
    isExplorerVisible,
    onToggleExplorer,
    isChatVisible,
    onToggleChat,
}: EditorHeaderProps) {
    const saveLabel =
        saveStatus === 'saving' ? 'Saving…'
        : saveStatus === 'saved' ? 'Saved'
        // Not saved, and the copy has to say so — the danger is a user carrying on editing while
        // believing their work is stored.
        : saveStatus === 'conflict' ? 'Not saved — reload to get the latest changes'
        : 'Ready';

    return (
        <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--background)] px-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
                <button type="button" onClick={onBack} className="grid size-9 shrink-0 place-items-center rounded-lg text-[var(--muted-text)] transition-colors hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]" aria-label="Back to projects">
                    <ArrowLeft className="size-4" />
                </button>
                <div className="min-w-0">
                    <p className="hidden truncate text-sm font-semibold text-[var(--foreground)] sm:block">{projectName}</p>
                    <p className={cn(
                        'flex items-center gap-1.5 text-[11px]',
                        saveStatus === 'conflict' ? 'font-medium text-red-500' : 'text-[var(--muted-text)]'
                    )}>
                        <span className={cn(
                            'size-1.5 rounded-full',
                            saveStatus === 'saving' ? 'animate-pulse bg-amber-400'
                            : saveStatus === 'conflict' ? 'bg-red-500'
                            : 'bg-emerald-400'
                        )} />
                        {saveLabel}
                    </p>
                </div>
            </div>

            <div className="mx-auto flex items-center rounded-lg bg-[var(--background-surface)] p-1" role="tablist" aria-label="Workspace view">
                {viewTabs.map(({ value, label, icon: Icon }) => (
                    <button key={value} type="button" role="tab" aria-selected={activeTab === value} onClick={() => setActiveTab(value)} className={cn('flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]', activeTab === value ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-text)] hover:text-[var(--foreground)]')}>
                        <Icon className="size-3.5" />
                        <span className="hidden md:inline">{label}</span>
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-1">
                <button type="button" onClick={onToggleChat} className={cn('grid size-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]', isChatVisible ? 'bg-[var(--background-surface)] text-[var(--foreground)]' : 'text-[var(--muted-text)] hover:bg-[var(--background-overlay)]')} aria-label={isChatVisible ? 'Hide chat' : 'Show chat'} aria-pressed={isChatVisible}><MessageSquare className="size-4" /></button>
                <button type="button" onClick={onToggleExplorer} className={cn('grid size-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]', isExplorerVisible ? 'bg-[var(--background-surface)] text-[var(--foreground)]' : 'text-[var(--muted-text)] hover:bg-[var(--background-overlay)]')} aria-label={isExplorerVisible ? 'Hide files' : 'Show files'} aria-pressed={isExplorerVisible}><FileText className="size-4" /></button>
                <div className="mx-1 hidden h-5 w-px bg-[var(--border)] lg:block" />
                <button type="button" onClick={onUndo} disabled={!canUndo} className="hidden size-9 place-items-center rounded-lg text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] disabled:opacity-30 lg:grid" aria-label="Undo"><Undo2 className="size-4" /></button>
                <button type="button" onClick={onRedo} disabled={!canRedo} className="hidden size-9 place-items-center rounded-lg text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] disabled:opacity-30 lg:grid" aria-label="Redo"><Redo2 className="size-4" /></button>
                <button type="button" onClick={onHelp} className="hidden size-9 place-items-center rounded-lg text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] xl:grid" aria-label="Help"><HelpCircle className="size-4" /></button>
                <button type="button" onClick={onLibrary} className="hidden size-9 place-items-center rounded-lg text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] xl:grid" aria-label="Component library"><Library className="size-4" /></button>
                <button type="button" onClick={onSettings} className="hidden size-9 place-items-center rounded-lg text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] xl:grid" aria-label="Project settings"><Settings className="size-4" /></button>
                <button type="button" onClick={onExport} className="hidden h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium text-[var(--secondary-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] lg:flex"><Download className="size-3.5" /> Export</button>
                <button type="button" onClick={onDeploy} disabled={isDeploying} className="ml-1 flex h-9 items-center gap-2 rounded-lg bg-[var(--primary)] px-3.5 text-xs font-semibold text-[var(--primary-foreground)] transition-transform hover:brightness-105 active:scale-[0.98] disabled:opacity-50"><Rocket className={cn('size-3.5', isDeploying && 'animate-pulse')} />{isDeploying ? 'Deploying' : 'Deploy'}</button>
            </div>
        </header>
    );
}
