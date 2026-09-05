'use client';

import { useRef, useState } from 'react';
import { AtSign, History, Paperclip, Send, Sparkles, X } from 'lucide-react';
import { ModelSelector } from '../ui/model-selector';
import { cn } from '@/lib/utils';
import TransformProgress, { type TransformProgressState } from './transform-progress';

interface EditorSidebarProps {
    transformPrompt: string;
    setTransformPrompt: (val: string) => void;
    selectedModel: { id: string; providerId: string };
    setSelectedModel: (val: { id: string; providerId: string }) => void;
    selectedElement: { path: string; html: string; selector?: string } | null;
    setSelectedElement: (val: { path: string; html: string; selector?: string } | null) => void;
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

    const withAttachments = () => [
        transformPrompt.trim(),
        ...attachments.map((attachment) => `\n[Attached file: ${attachment.name}]\n${attachment.content}`),
    ].join('\n').trim();

    const submit = () => {
        if (isTransforming || !transformPrompt.trim()) return;
        void runTransform(withAttachments());
        setAttachments([]);
    };

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

    const targetLabel = (() => {
        if (!selectedElement) return null;
        try {
            const doc = new DOMParser().parseFromString(selectedElement.html, 'text/html');
            const element = doc.body.firstElementChild;
            return element ? `${element.tagName.toLowerCase()} · ${selectedElement.path}` : selectedElement.path;
        } catch {
            return selectedElement.path;
        }
    })();

    return (
        <aside className="flex h-full w-[360px] flex-col border-r border-[var(--border)] bg-[var(--background)] max-xl:w-[320px]" aria-label="Project chat">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--border)] px-4">
                <div>
                    <h2 className="text-sm font-semibold text-[var(--foreground)]">Project chat</h2>
                    <p className="text-[11px] text-[var(--muted-text)]">{messages.length ? `${messages.length} messages` : 'Start with a request'}</p>
                </div>
                {versions.length > 0 && onRestoreVersion ? (
                    <details className="group relative">
                        <summary className="grid size-8 cursor-pointer list-none place-items-center rounded-lg text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)]" aria-label="Version history"><History className="size-4" /></summary>
                        <div className="absolute left-0 top-10 z-50 w-72 rounded-xl border border-[var(--border)] bg-[var(--background)] p-2 shadow-2xl">
                            <p className="px-2 pb-2 pt-1 text-xs font-medium">Version history</p>
                            <div className="max-h-64 space-y-0.5 overflow-y-auto">
                                {versions.map((version) => <button key={version.id} type="button" onClick={() => void onRestoreVersion(version.id)} className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-xs text-[var(--secondary-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)]" title={version.summary}>{version.summary}</button>)}
                            </div>
                        </div>
                    </details>
                ) : null}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-5" aria-live="polite">
                {messages.length === 0 ? (
                    <div className="mx-auto mt-10 max-w-[260px] text-center">
                        <div className="mx-auto mb-4 grid size-10 place-items-center rounded-xl bg-[var(--background-surface)] text-[var(--primary)]"><Sparkles className="size-4" /></div>
                        <p className="text-sm font-medium">Build with conversation</p>
                        <p className="mt-2 text-xs leading-5 text-[var(--muted-text)]">Ask for features, backend routes, database changes, or visual refinements.</p>
                    </div>
                ) : messages.map((message) => (
                    <div key={message.id} className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[88%] text-[13px] leading-5', message.role === 'user' ? 'rounded-2xl rounded-br-md bg-[var(--primary)] px-3.5 py-2.5 text-[var(--primary-foreground)]' : message.role === 'system' ? 'w-full rounded-xl border border-red-400/25 bg-red-400/[0.06] px-3.5 py-3 text-red-300' : 'text-[var(--secondary-text)]')}>
                            <p className="whitespace-pre-wrap">{message.content}</p>
                            {message.files?.length ? <p className="mt-2 text-[10px] opacity-60">Changed {message.files.length} files</p> : null}
                        </div>
                    </div>
                ))}
            </div>

            <div className="shrink-0 border-t border-[var(--border)] p-3">
                <div className="mb-3 grid grid-cols-2 rounded-lg bg-[var(--background-surface)] p-1" aria-label="Chat mode">
                    {(['build', 'discuss'] as const).map((value) => <button key={value} type="button" onClick={() => onModeChange?.(value)} className={cn('h-8 rounded-md text-xs font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]', mode === value ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-text)] hover:text-[var(--foreground)]')}>{value}</button>)}
                </div>

                {selectedElement ? (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-[var(--primary)]/25 bg-[var(--primary)]/[0.06] px-3 py-2 text-xs">
                        <span className="size-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                        <span className="min-w-0 flex-1 truncate text-[var(--secondary-text)]">{targetLabel}</span>
                        <button type="button" onClick={() => setSelectedElement(null)} className="text-[var(--muted-text)] hover:text-[var(--foreground)]" aria-label="Clear selected element"><X className="size-3.5" /></button>
                    </div>
                ) : null}

                {attachments.length ? <div className="mb-2 flex flex-wrap gap-1.5">{attachments.map((attachment) => <button key={attachment.name} type="button" onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))} className="max-w-32 truncate rounded-md bg-[var(--background-surface)] px-2 py-1 text-[10px] text-[var(--secondary-text)]" title={`Remove ${attachment.name}`}>{attachment.name} ×</button>)}</div> : null}

                <div className="rounded-xl border border-[var(--border)] bg-[var(--background-surface)] p-2 transition-colors focus-within:border-[var(--primary)]/60 focus-within:ring-1 focus-within:ring-[var(--primary)]/20">
                    <textarea value={transformPrompt} onChange={(event) => setTransformPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submit(); } }} placeholder={mode === 'discuss' ? 'Ask about this project…' : selectedElement ? 'Describe the change to this element…' : 'Ask for a change…'} className="min-h-20 w-full resize-none bg-transparent px-1.5 py-1 text-[13px] leading-5 text-[var(--foreground)] outline-none placeholder:text-[var(--muted-text)]" />
                    <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex items-center gap-1">
                            <input ref={attachmentInput} type="file" multiple accept=".txt,.md,.html,.css,.js,.ts,.json,.jsonc,.sql,.svg" className="hidden" onChange={(event) => void addAttachments(event.target.files)} />
                            <button type="button" onClick={() => attachmentInput.current?.click()} className="grid size-8 place-items-center rounded-md text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)]" aria-label="Attach file"><Paperclip className="size-3.5" /></button>
                            {filePaths.length ? <label className="relative grid size-8 place-items-center rounded-md text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)]" title="Reference project file"><AtSign className="size-3.5" /><select aria-label="Reference project file" defaultValue="" onChange={(event) => { if (event.target.value) setTransformPrompt(`${transformPrompt}${transformPrompt ? '\n' : ''}@${event.target.value} `); event.target.value = ''; }} className="absolute inset-0 cursor-pointer opacity-0"><option value="">Reference file</option>{filePaths.map((path) => <option key={path} value={path}>{path}</option>)}</select></label> : null}
                            <button type="button" onClick={runPolish} disabled={isTransforming} className="grid size-8 place-items-center rounded-md text-[var(--muted-text)] hover:bg-[var(--background-overlay)] hover:text-[var(--foreground)] disabled:opacity-40" aria-label="Polish project"><Sparkles className="size-3.5" /></button>
                        </div>
                        <button type="button" onClick={submit} disabled={isTransforming || !transformPrompt.trim()} className="grid size-8 place-items-center rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] transition-transform hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35" aria-label={mode === 'build' ? 'Build request' : 'Send question'}><Send className="size-3.5" /></button>
                    </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                    <ModelSelector selectedModelId={selectedModel.id} providerId={selectedModel.providerId} onModelChange={(id, providerId) => setSelectedModel({ id, providerId })} className="min-w-0 flex-1" />
                    <span className="shrink-0 text-[10px] text-[var(--muted-text)]">⌘ Enter</span>
                </div>
                <TransformProgress state={transformProgress} />
                {isTransforming && onCancelTransform ? <button type="button" onClick={onCancelTransform} className="mt-2 w-full text-center text-xs text-[var(--muted-text)] hover:text-[var(--foreground)]">Stop current request</button> : null}
            </div>
        </aside>
    );
}
