'use client';

import { addableOpenRouterModels } from '@/lib/ai-admin-config';

export function AddableOpenRouterModels({
  alreadyHave,
  onAdd,
}: {
  alreadyHave: string[];
  onAdd: (modelId: string) => void;
}) {
  const remaining = addableOpenRouterModels(alreadyHave);

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-mono uppercase text-[var(--muted-text)]">Also available to add</div>
      {remaining.length === 0 ? (
        <div className="text-[10px] font-mono text-[var(--muted-text)]">
          All suggested free models are already added.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {remaining.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => onAdd(model.id)}
              className="w-full text-left px-2 py-2 border border-[var(--border)] hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--foreground)]">
                  {model.name}
                </span>
                <span className="text-[9px] font-mono uppercase text-[var(--primary)]">Add</span>
              </div>
              <div className="text-[9px] font-mono text-[var(--muted-text)] truncate">{model.id}</div>
              <div className="text-[9px] font-mono text-[var(--secondary-text)]">{model.note}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
