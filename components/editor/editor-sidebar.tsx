'use client';

import { useEffect, useRef, useState } from 'react';
import {
    ArrowUpIcon,
    AtIcon,
    ClockCounterClockwiseIcon,
    PaperclipIcon,
    SparkleIcon,
    XIcon,
} from '@phosphor-icons/react';
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
    const scrollRef = useRef<HTMLDivElement>(null);
    const [attachments, setAttachments] = useState<Array<{ name: string; content: string }>>([]);

    // Follow the conversation as it grows, the way a chat thread should.
    useEffect(() => {
        const node = scrollRef.current;
        if (!node) return;
        node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
    }, [messages.length, transformProgress]);

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

    const canSend = !isTransforming && Boolean(transformPrompt.trim());

    return (
        <aside
            className="flex h-full w-[380px] flex-col border-r border-border bg-background max-xl:w-[330px]"
            aria-label="Project chat"
        >
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold">Project chat</h2>
                    <p className="truncate text-xs text-muted-foreground">
                        {messages.length ? `${messages.length} message${messages.length === 1 ? '' : 's'}` : 'Start with a request'}
                    </p>
                </div>
                {versions.length > 0 && onRestoreVersion ? (
                    <details className="group relative shrink-0">
                        <summary
                            className="grid size-8 cursor-pointer list-none place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                            aria-label="Version history"
                        >
                            <ClockCounterClockwiseIcon className="size-4" />
                        </summary>
                        <div className="absolute right-0 top-10 z-30 w-72 rounded-xl border border-border bg-popover p-1.5 shadow-elev-lg">
                            <p className="px-2 pb-1.5 pt-1 text-xs font-medium">Version history</p>
                            <div className="custom-scrollbar max-h-64 space-y-0.5 overflow-y-auto">
                                {versions.map((version) => (
                                    <button
                                        key={version.id}
                                        type="button"
                                        onClick={() => void onRestoreVersion(version.id)}
                                        className="block w-full truncate rounded-lg px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                                        title={version.summary}
                                    >
                                        {version.summary}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </details>
                ) : null}
            </div>

            <div
                ref={scrollRef}
                className="custom-scrollbar flex-1 overflow-y-auto scroll-smooth px-4 py-5"
                aria-live="polite"
            >
                {messages.length === 0 ? (
                    <div className="mx-auto mt-10 max-w-[260px] text-center">
                        <div className="mx-auto mb-4 grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                            <SparkleIcon className="size-4" />
                        </div>
                        <p className="text-base font-semibold">Build with conversation</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            Ask for features, backend routes, database changes, or visual refinements.
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-y-6">
                        {messages.map((message) => {
                            if (message.role === 'user') {
                                // User turns get a muted pill, pushed right by the grid.
                                return (
                                    <div
                                        key={message.id}
                                        className="grid grid-cols-[minmax(48px,1fr)_auto] animate-in fade-in slide-in-from-bottom-1 duration-150"
                                    >
                                        <div className="col-start-2 min-w-0 rounded-xl bg-muted px-4 py-2 text-sm leading-relaxed text-foreground">
                                            <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                        </div>
                                    </div>
                                );
                            }

                            if (message.role === 'system') {
                                return (
                                    <div
                                        key={message.id}
                                        role="alert"
                                        className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in duration-150"
                                    >
                                        <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                    </div>
                                );
                            }

                            // Assistant turns are plain prose at full width and full
                            // contrast — they are the content, not a chat bubble.
                            return (
                                <div
                                    key={message.id}
                                    className="text-sm leading-relaxed text-foreground animate-in fade-in slide-in-from-bottom-1 duration-150"
                                >
                                    <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                    {message.files?.length ? (
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            Changed {message.files.length} file{message.files.length === 1 ? '' : 's'}
                                        </p>
                                    ) : null}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="shrink-0 border-t border-border p-3">
                <div
                    role="tablist"
                    aria-label="Chat mode"
                    className="mb-3 grid grid-cols-2 gap-0.5 rounded-full border border-border bg-muted/50 p-0.5"
                >
                    {(['build', 'discuss'] as const).map((value) => (
                        <button
                            key={value}
                            type="button"
                            role="tab"
                            aria-selected={mode === value}
                            onClick={() => onModeChange?.(value)}
                            className={cn(
                                'h-7 rounded-full text-sm capitalize transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                mode === value
                                    ? 'bg-background text-foreground shadow-elev-xs'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            {value}
                        </button>
                    ))}
                </div>

                {selectedElement ? (
                    <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm">
                        <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{targetLabel}</span>
                        <button
                            type="button"
                            onClick={() => setSelectedElement(null)}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                            aria-label="Clear selected element"
                        >
                            <XIcon className="size-3.5" />
                        </button>
                    </div>
                ) : null}

                {attachments.length ? (
                    <div className="mb-2 flex flex-wrap gap-1.5">
                        {attachments.map((attachment) => (
                            <button
                                key={attachment.name}
                                type="button"
                                onClick={() => setAttachments((current) => current.filter((item) => item !== attachment))}
                                className="inline-flex max-w-40 items-center gap-1 truncate rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                title={`Remove ${attachment.name}`}
                            >
                                <span className="truncate">{attachment.name}</span>
                                <XIcon className="size-3 shrink-0" />
                            </button>
                        ))}
                    </div>
                ) : null}

                <div className="composer-surface border border-border/60 focus-within:border-border">
                    <label htmlFor="editor-composer" className="sr-only">
                        {mode === 'discuss' ? 'Ask about this project' : 'Describe a change'}
                    </label>
                    <textarea
                        id="editor-composer"
                        value={transformPrompt}
                        onChange={(event) => setTransformPrompt(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                                event.preventDefault();
                                submit();
                            }
                        }}
                        placeholder={
                            mode === 'discuss'
                                ? 'Ask about this project…'
                                : selectedElement
                                    ? 'Describe the change to this element…'
                                    : 'Ask for a change…'
                        }
                        className="max-h-40 min-h-20 w-full resize-none bg-transparent px-2.5 py-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground/80"
                    />
                    <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
                        <div className="flex items-center gap-0.5">
                            <input
                                ref={attachmentInput}
                                type="file"
                                multiple
                                accept=".txt,.md,.html,.css,.js,.ts,.json,.jsonc,.sql,.svg"
                                className="hidden"
                                onChange={(event) => void addAttachments(event.target.files)}
                            />
                            <button
                                type="button"
                                onClick={() => attachmentInput.current?.click()}
                                className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                aria-label="Attach file"
                            >
                                <PaperclipIcon className="size-4" />
                            </button>
                            {filePaths.length ? (
                                <label
                                    className="relative grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                                    title="Reference project file"
                                >
                                    <AtIcon className="size-4" />
                                    <select
                                        aria-label="Reference project file"
                                        defaultValue=""
                                        onChange={(event) => {
                                            if (event.target.value) setTransformPrompt(`${transformPrompt}${transformPrompt ? '\n' : ''}@${event.target.value} `);
                                            event.target.value = '';
                                        }}
                                        className="absolute inset-0 cursor-pointer opacity-0"
                                    >
                                        <option value="">Reference file</option>
                                        {filePaths.map((path) => <option key={path} value={path}>{path}</option>)}
                                    </select>
                                </label>
                            ) : null}
                            <button
                                type="button"
                                onClick={runPolish}
                                disabled={isTransforming}
                                className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
                                aria-label="Polish project"
                            >
                                <SparkleIcon className="size-4" />
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={submit}
                            disabled={!canSend}
                            className={cn(
                                'grid size-7 place-items-center rounded-full transition-all',
                                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                                canSend
                                    ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                                    : 'cursor-not-allowed bg-muted text-muted-foreground',
                            )}
                            aria-label={mode === 'build' ? 'Build request' : 'Send question'}
                        >
                            <ArrowUpIcon className="size-4" weight="bold" />
                        </button>
                    </div>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                    <ModelSelector
                        selectedModelId={selectedModel.id}
                        providerId={selectedModel.providerId}
                        onModelChange={(id, providerId) => setSelectedModel({ id, providerId })}
                        className="min-w-0"
                    />
                    <kbd className="shrink-0 text-xs text-muted-foreground">⌘↵</kbd>
                </div>

                <TransformProgress state={transformProgress} />

                {isTransforming && onCancelTransform ? (
                    <button
                        type="button"
                        onClick={onCancelTransform}
                        className="mt-2 w-full rounded-lg py-1.5 text-center text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                        Stop
                    </button>
                ) : null}
            </div>
        </aside>
    );
}
