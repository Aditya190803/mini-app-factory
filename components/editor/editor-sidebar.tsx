'use client';

import React, { useRef, useState } from 'react';
import { ModelSelector } from '../ui/model-selector';
import { 
    Zap as ZapIcon 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import TransformProgress, { type TransformProgressState } from './transform-progress';

interface EditorSidebarProps {
    transformPrompt: string;
    setTransformPrompt: (val: string) => void;
    selectedModel: { id: string, providerId: string };
    setSelectedModel: (val: { id: string, providerId: string }) => void;
    selectedElement: { path: string, html: string, selector?: string } | null;
    setSelectedElement: (val: { path: string, html: string, selector?: string } | null) => void;
    runTransform: (promptOverride?: string) => void | Promise<void>;
    runPolish: () => void;
    isTransforming: boolean;
    transformProgress?: TransformProgressState | null;
    onCancelTransform?: () => void;
    messages?: Array<{ id: string; role: 'user' | 'assistant' | 'system'; content: string; status: string; files?: string[] }>;
    versions?: Array<{ id: string; summary: string }>;
    onRestoreVersion?: (id: string) => void | Promise<void>;
    mode?: 'build' | 'discuss';
    onModeChange?: (mode: 'build' | 'discuss') => void;
    filePaths?: string[];
}

export default function EditorSidebar({
    transformPrompt,
    setTransformPrompt,
    selectedModel,
    setSelectedModel,
    selectedElement,
    setSelectedElement,
    runTransform,
    runPolish,
    isTransforming,
    transformProgress = null,
    onCancelTransform,
    messages = [],
    versions = [],
    onRestoreVersion,
    mode = 'build',
    onModeChange,
    filePaths = [],
}: EditorSidebarProps) {
    const attachmentInput = useRef<HTMLInputElement>(null);
    const [attachments, setAttachments] = useState<Array<{ name: string; content: string }>>([]);
    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            if (!isTransforming && transformPrompt.trim()) {
                runTransform(withAttachments());
            }
        }
    };

    const withAttachments = () => [
        transformPrompt.trim(),
        ...attachments.map((attachment) => `\n[Attached file: ${attachment.name}]\n${attachment.content}`),
    ].join('\n').trim();

    const addAttachments = async (files: FileList | null) => {
        if (!files) return;
        const next: Array<{ name: string; content: string }> = [];
        for (const file of Array.from(files).slice(0, 3)) {
            if (file.size > 64 * 1024) continue;
            next.push({ name: file.name, content: (await file.text()).slice(0, 24_000) });
        }
        setAttachments((current) => [...current, ...next].slice(0, 3));
        if (attachmentInput.current) attachmentInput.current.value = '';
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
            const selectorSuffix = selectedElement.selector ? ` • ${selectedElement.selector}` : '';
            return `<${tag}${className}> in ${selectedElement.path}${selectorSuffix}`;
        } catch {
            return selectedElement.path;
        }
    };

    return (
        <aside
            className="w-80 border-l flex flex-col overflow-hidden shrink-0 shadow-2xl"
            style={{
                backgroundColor: '#0a0a0a',
                borderColor: 'var(--border)',
            }}
        >
            {/* Transform Section */}
            <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-5 overflow-y-auto flex-1 space-y-6 scrollbar-thin">
                    <div>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-[10px] font-mono uppercase font-black tracking-[0.2em] text-[var(--muted-text)]">Project chat</h2>
                            <span className="text-[9px] text-[var(--muted-text)]">{messages.length} messages</span>
                        </div>
                        <div className="space-y-3" aria-live="polite">
                            {messages.length === 0 ? (
                                <p className="rounded-lg border border-white/5 px-3 py-4 text-[11px] leading-5 text-[var(--muted-text)]">
                                    Ask for a feature, backend route, database, or design change. Each successful build is saved as a restorable project version.
                                </p>
                            ) : messages.map((message) => (
                                <div
                                    key={message.id}
                                    className={cn(
                                        'rounded-lg px-3 py-2.5 text-[11px] leading-5',
                                        message.role === 'user'
                                            ? 'ml-5 bg-[var(--primary)] text-[var(--primary-foreground)]'
                                            : message.role === 'system'
                                                ? 'border border-red-400/20 bg-red-400/5 text-red-300'
                                                : 'mr-4 border border-white/5 bg-white/[0.025] text-[var(--secondary-text)]'
                                    )}
                                >
                                    <p className="mb-1 text-[8px] font-mono uppercase tracking-widest opacity-60">{message.role}</p>
                                    <p className="whitespace-pre-wrap">{message.content}</p>
                                    {message.files?.length ? (
                                        <details className="mt-2">
                                            <summary className="cursor-pointer text-[9px] font-mono opacity-60">{message.files.length} files in this version</summary>
                                            <div className="mt-1 space-y-0.5 font-mono text-[9px] opacity-70">
                                                {message.files.map((path) => <div key={path} className="truncate">{path}</div>)}
                                            </div>
                                        </details>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                        {versions.length > 0 && onRestoreVersion ? (
                            <details className="mt-3 border-t border-white/5 pt-3">
                                <summary className="cursor-pointer text-[9px] font-mono uppercase tracking-widest text-[var(--muted-text)] hover:text-[var(--foreground)]">Version history</summary>
                                <div className="mt-2 space-y-1">
                                    {versions.map((version) => (
                                        <button key={version.id} type="button" onClick={() => void onRestoreVersion(version.id)} className="block w-full truncate rounded px-2 py-2 text-left text-[10px] text-[var(--secondary-text)] hover:bg-white/5 hover:text-[var(--foreground)]" title={version.summary}>
                                            Restore: {version.summary}
                                        </button>
                                    ))}
                                </div>
                            </details>
                        ) : null}
                    </div>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 rounded-lg border border-white/5 bg-black/30 p-1" aria-label="Chat mode">
                            {(['build', 'discuss'] as const).map((value) => (
                                <button key={value} type="button" onClick={() => onModeChange?.(value)} className={cn('rounded-md px-3 py-2 text-[9px] font-mono uppercase tracking-widest transition-colors', mode === value ? 'bg-white/10 text-[var(--foreground)]' : 'text-[var(--muted-text)] hover:text-[var(--secondary-text)]')}>
                                    {value}
                                </button>
                            ))}
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-3 bg-[var(--primary)] rounded-full" />
                            <h3 className="text-[10px] font-mono uppercase font-black tracking-[0.2em] text-[var(--muted-text)]">
                                {mode === 'build' ? 'Build request' : 'Discuss project'}
                            </h3>
                        </div>

                        {selectedElement && (
                            <div className="p-3 bg-[var(--primary)]/5 border border-[var(--primary)]/20 rounded-xl flex items-center justify-between group animate-in fade-in slide-in-from-left-2">
                                <div className="flex flex-col min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)]" />
                                        <span className="text-[9px] uppercase font-black text-[var(--primary)] tracking-widest">Active Target</span>
                                    </div>
                                    <span className="text-[11px] font-mono text-[var(--foreground)] truncate pr-4">
                                        {getElementBadgeInfo()}
                                    </span>
                                </div>
                                <button 
                                    onClick={() => setSelectedElement(null)}
                                    className="p-1.5 hover:bg-[var(--primary)]/20 rounded-md text-[var(--muted-text)] hover:text-[var(--primary)] transition-all active:scale-90"
                                    title="Clear selection"
                                >
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                </button>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div className="relative group">
                                <div className="absolute -inset-0.5 bg-gradient-to-r from-[var(--primary)]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity rounded-xl blur-sm pointer-events-none" />
                                <ModelSelector 
                                    selectedModelId={selectedModel.id}
                                    providerId={selectedModel.providerId}
                                    onModelChange={(id, providerId) => setSelectedModel({ id, providerId })}
                                    className="w-full relative"
                                />
                            </div>
                        </div>

                        <div className="relative">
                            <textarea
                                value={transformPrompt}
                                onChange={(e) => setTransformPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={mode === 'discuss' ? 'Ask about the architecture, files, or next change…' : selectedElement ? "Describe the change to this element…" : "Ask Mini App Factory to build or change something…"}
                                className="w-full h-40 resize-none text-[12px] p-4 rounded-xl border bg-black/40 focus:outline-none focus:border-[var(--primary)]/50 focus:ring-1 focus:ring-[var(--primary)]/20 transition-all font-mono leading-relaxed placeholder:opacity-20"
                                style={{
                                    borderColor: 'var(--border)',
                                    color: 'var(--foreground)',
                                }}
                            />
                            <div className="absolute bottom-3 right-3 flex items-center gap-2 pointer-events-none opacity-20 group-focus-within:opacity-100 transition-opacity">
                                <span className="text-[8px] font-mono uppercase tracking-widest bg-white/5 px-1.5 py-0.5 rounded border border-white/10">Ctrl+Enter</span>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <input ref={attachmentInput} type="file" multiple accept=".txt,.md,.html,.css,.js,.ts,.json,.jsonc,.sql,.svg" className="hidden" onChange={(event) => void addAttachments(event.target.files)} />
                            <button type="button" onClick={() => attachmentInput.current?.click()} className="rounded border border-white/10 px-2 py-1 text-[9px] font-mono text-[var(--muted-text)] hover:text-[var(--foreground)]">Attach file</button>
                            {filePaths.length > 0 ? (
                                <select aria-label="Reference project file" defaultValue="" onChange={(event) => { if (event.target.value) setTransformPrompt(`${transformPrompt}${transformPrompt ? '\n' : ''}@${event.target.value} `); event.target.value = ''; }} className="max-w-32 rounded border border-white/10 bg-black px-2 py-1 text-[9px] text-[var(--muted-text)]">
                                    <option value="">@ file</option>
                                    {filePaths.map((path) => <option key={path} value={path}>{path}</option>)}
                                </select>
                            ) : null}
                            {attachments.map((attachment) => (
                                <button key={attachment.name} type="button" onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))} className="max-w-28 truncate rounded bg-white/5 px-2 py-1 text-[9px] text-[var(--secondary-text)]" title={`Remove ${attachment.name}`}>{attachment.name} ×</button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-5 border-t bg-black/40 backdrop-blur-md space-y-3" style={{ borderColor: 'var(--border)' }}>
                    <TransformProgress state={transformProgress} />
                    {isTransforming && onCancelTransform ? (
                        <button
                            type="button"
                            onClick={onCancelTransform}
                            className="w-full text-[10px] font-mono uppercase text-[var(--muted-text)] hover:text-[var(--foreground)] transition-colors"
                        >
                            Cancel
                        </button>
                    ) : null}
                    <div className="flex gap-2">
                        <button
                            onClick={() => { void runTransform(withAttachments()); setAttachments([]); }}
                            disabled={isTransforming || !transformPrompt.trim()}
                            className={cn(
                                "flex-1 h-11 text-[11px] font-mono uppercase font-black flex items-center justify-center gap-3 transition-all rounded-lg relative overflow-hidden group",
                                isTransforming || !transformPrompt.trim()
                                    ? "bg-white/5 text-[var(--muted-text)] border border-white/5 cursor-not-allowed"
                                    : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:translate-y-[-1px] active:translate-y-[1px] shadow-[0_10px_20px_-10px_rgba(245,158,11,0.4)]"
                            )}
                        >
                            {isTransforming ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent animate-spin rounded-full" />
                                    <span>Processing</span>
                                </>
                            ) : (
                                <>
                                    <ZapIcon size={14} className="group-hover:scale-125 transition-transform" />
                                    <span>{mode === 'build' ? 'Build' : 'Discuss'}</span>
                                </>
                            )}
                            {!isTransforming && transformPrompt.trim() && (
                                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </button>
                        <button
                            onClick={runPolish}
                            disabled={isTransforming}
                            className="w-14 h-11 flex items-center justify-center rounded-lg border border-white/10 hover:border-white/30 hover:bg-white/5 transition-all text-[var(--foreground)] group active:scale-95"
                            title="Auto-Polish Code"
                        >
                            <svg className="w-4 h-4 group-hover:rotate-12 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </aside>
    );
}
