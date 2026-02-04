'use client';

import React, { useEffect, useState } from 'react';
import { ChevronDown, Cpu, Zap as ZapIcon, Check, Settings2, Eye } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

interface Model {
  id: string;
  name: string;
  fullName: string;
  provider: string;
  providerId: string;
  hasVision?: boolean;
}

interface ModelSelectorProps {
  selectedModelId?: string;
  providerId?: string;
  onModelChange: (modelId: string, providerId: string) => void;
  className?: string;
}

export function ModelSelector({ selectedModelId, providerId, onModelChange, className }: ModelSelectorProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    async function fetchModels() {
      try {
        const resp = await fetch('/api/ai/models');
        if (resp.ok) {
          const data = await resp.json();
          setModels(data.models);
        } else {
          setError(true);
        }
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    }
    fetchModels();
  }, []);

  const selectedModel = models.find(m => m.id === selectedModelId && m.providerId === providerId);
  const displayText = selectedModel ? selectedModel.fullName : 'Default (Cerebras + Groq)';

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2 px-2 py-1 border-b border-dashed border-[var(--border)] opacity-50", className)}>
        <Settings2 size={12} className="animate-spin text-[var(--primary)]" />
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted-text)]">Scanning Engines...</span>
      </div>
    );
  }

  if (error || models.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 px-2 py-1 border-b border-[var(--error)]", className)}>
        <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--error)]">Engine Link Failure</span>
      </div>
    );
  }

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button 
          className={cn(
            "flex items-center gap-3 px-4 py-2 bg-black/40 border border-[var(--border)] rounded-md transition-all hover:border-[var(--primary)] hover:bg-black/60 group text-left outline-none",
            className
          )}
        >
          <Cpu size={14} className="text-[var(--muted-text)] group-hover:text-[var(--primary)] transition-colors" />
          <div className="flex flex-col gap-0">
            <span className="text-[7px] font-mono uppercase tracking-[0.2em] text-[var(--muted-text)]">Engine</span>
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--foreground)] truncate max-w-[150px]">
              {displayText}
            </span>
          </div>
          <ChevronDown size={12} className={cn("ml-2 transition-transform duration-300 text-[var(--muted-text)] group-hover:text-[var(--primary)]", open && "rotate-180")} />
        </button>
      </Popover.Trigger>
      
      <Popover.Portal>
        <Popover.Content 
          className="z-[100] w-72 mt-2 bg-[var(--background-overlay)] border border-[var(--border)] shadow-2xl backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
          align="start"
        >
          <div className="max-h-[350px] overflow-y-auto custom-scrollbar">
            <div className="p-1 border-b border-[var(--border)] bg-[var(--background-surface)] flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--muted-text)]">Defaults</span>
              </div>
              <Cpu size={10} className="text-[var(--muted-text)]" />
            </div>
            
            <button
              onClick={() => {
                onModelChange('', '');
                setOpen(false);
              }}
              className={cn(
                "w-full px-4 py-3 text-left flex items-center justify-between hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] group transition-all border-b border-[var(--border)]",
                (!selectedModelId || !providerId) ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--foreground)]"
              )}
            >
              <div className="flex flex-col">
                <span className="text-[10px] font-mono font-black uppercase tracking-wider">Aggregated Default</span>
                <span className="text-[8px] font-mono opacity-70 uppercase">High-Speed Parallel Processing</span>
              </div>
              {(!selectedModelId || !providerId) && <Check size={14} strokeWidth={3} />}
            </button>

            {['cerebras', 'groq'].map(pId => {
              const providerModels = models.filter(m => m.providerId === pId);
              if (providerModels.length === 0) return null;

              return (
                <div key={pId}>
                  <div className="px-3 py-1.5 bg-[var(--background-surface)] border-b border-[var(--border)] flex items-center gap-2">
                    <ZapIcon size={10} className="text-[var(--primary)]" />
                    <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--primary)] opacity-80">{pId} Models</span>
                  </div>
                  {providerModels.map((m) => {
                    const isSelected = m.id === selectedModelId && m.providerId === providerId;
                    return (
                      <button
                        key={`${m.providerId}-${m.id}`}
                        onClick={() => {
                          onModelChange(m.id, m.providerId);
                          setOpen(false);
                        }}
                        className={cn(
                          "w-full px-4 py-3 text-left flex items-center justify-between hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)] group transition-all border-b border-[var(--border)]/50 last:border-b-0",
                          isSelected ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--foreground)]"
                        )}
                      >
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-mono uppercase tracking-tight font-bold">{m.name}</span>
                            {m.hasVision && (
                              <div className="flex items-center gap-0.5 px-1 bg-[var(--primary)]/10 border border-[var(--primary)]/20 rounded-[2px]" title="Vision Capable">
                                <Eye size={8} className="text-[var(--primary)]" />
                                <span className="text-[7px] font-mono text-[var(--primary)] font-black uppercase">Vision</span>
                              </div>
                            )}
                          </div>
                          {m.name !== m.id && (
                            <span className="text-[8px] font-mono opacity-70 uppercase truncate max-w-[200px] font-light">{m.id}</span>
                          )}
                        </div>
                        {isSelected && <Check size={14} strokeWidth={3} />}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
