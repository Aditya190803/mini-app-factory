'use client';

import type React from 'react';
import { ModelSelector } from '../ui/model-selector';
import { 
    Zap as ZapIcon 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EditorSidebarProps {
    transformPrompt: string;
    setTransformPrompt: (val: string) => void;
    selectedModel: { id: string, providerId: string };
    setSelectedModel: (val: { id: string, providerId: string }) => void;
    selectedElement: { path: string, html: string, selector?: string } | null;
    setSelectedElement: (val: { path: string, html: string, selector?: string } | null) => void;
    runTransform: () => void;
    runPolish: () => void;
    isTransforming: boolean;
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
                <div className="p-5 overflow-y-auto flex-1 space-y-8 scrollbar-thin">
                    <div className="space-y-4">
                        <div className="flex items-center gap-2">
                            <div className="w-1 h-3 bg-[var(--primary)] rounded-full" />
                            <h3 className="text-[10px] font-mono uppercase font-black tracking-[0.2em] text-[var(--muted-text)]">
                                Transformation Engine
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
                                placeholder={selectedElement ? "Describe precise changes..." : "System instructions... (e.g., 'Optimize for mobile grid')"}
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
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-5 border-t bg-black/40 backdrop-blur-md space-y-3" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex gap-2">
                        <button
                            onClick={runTransform}
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
                                    <span>Execute Transform</span>
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
