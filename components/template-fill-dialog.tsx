'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface TemplateCategory {
  id: string;
  category: string;
  template: string;
}

interface TemplateFillDialogProps {
  template: TemplateCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (filledPrompt: string) => void;
}

const extractTemplateFields = (template: string) => {
  const matches = template.match(/\[[^\]]+\]/g) ?? [];
  return Array.from(
    new Set(matches.map((field) => field.slice(1, -1).trim()).filter(Boolean))
  );
};

const fillTemplate = (template: string, values: Record<string, string>) =>
  template.replace(/\[([^\]]+)\]/g, (_, rawKey) => {
    const key = String(rawKey).trim();
    return values[key]?.trim() || `[${key}]`;
  });

export default function TemplateFillDialog({
  template,
  open,
  onOpenChange,
  onApply,
}: TemplateFillDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});

  const fields = useMemo(
    () => (template ? extractTemplateFields(template.template) : []),
    [template]
  );

  // Reset values whenever the selected template changes
  const prevTemplateId = useRef(template?.id);
  useEffect(() => {
    if (template && template.id !== prevTemplateId.current) {
      const initial = extractTemplateFields(template.template).reduce<
        Record<string, string>
      >((acc, f) => {
        acc[f] = '';
        return acc;
      }, {});
      setValues(initial);
    }
    prevTemplateId.current = template?.id;
  }, [template]);

  const handleApply = () => {
    if (!template) return;
    onApply(fillTemplate(template.template, values));
    onOpenChange(false);
  };

  const handleFieldChange = (field: string, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  if (!template) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/80 backdrop-blur-md"
            onClick={() => onOpenChange(false)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Dialog Panel */}
          <motion.div
            className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl border border-white/10 shadow-[0_50px_120px_-30px_rgba(245,158,11,0.15)]"
            style={{ backgroundColor: 'rgba(14, 14, 14, 0.98)' }}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 30, stiffness: 400 }}
          >
            {/* Decorative top accent */}
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent opacity-60" />

            {/* Header */}
            <div className="px-8 pt-8 pb-0">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-6 bg-[var(--primary)] rounded-sm" />
                  <h2
                    className="text-sm font-mono font-black uppercase tracking-[0.3em]"
                    style={{ color: 'var(--foreground)' }}
                  >
                    {template.category}
                  </h2>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-md border border-white/10 text-[var(--muted-text)] hover:text-[var(--foreground)] hover:border-white/20 transition-all"
                >
                  <span className="text-xs font-mono">×</span>
                </button>
              </div>
              <p
                className="text-[9px] font-mono uppercase tracking-[0.2em] mb-6"
                style={{ color: 'var(--muted-text)' }}
              >
                Fill in each parameter below — preview updates in real-time
              </p>
            </div>

            <div className="overflow-y-auto max-h-[calc(85vh-180px)] px-8 pb-4">
              {/* Live Preview */}
              <div
                className="mb-8 p-5 rounded-xl border border-white/5 relative overflow-hidden"
                style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}
              >
                <div
                  className="absolute inset-0 pointer-events-none opacity-[0.02]"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, white 1px, transparent 1px)',
                    backgroundSize: '16px 16px',
                  }}
                />
                <div className="flex items-center gap-2 mb-3 relative">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] animate-pulse" />
                  <span
                    className="text-[8px] font-mono uppercase tracking-[0.3em]"
                    style={{ color: 'var(--muted-text)' }}
                  >
                    Live Preview
                  </span>
                </div>
                <p
                  className="text-sm font-mono leading-relaxed relative"
                  style={{ color: 'var(--secondary-text)' }}
                >
                  {template.template.split(/(\[[^\]]+\])/g).map((segment, i) => {
                    const bracketMatch = segment.match(/^\[([^\]]+)\]$/);
                    if (bracketMatch) {
                      const key = bracketMatch[1].trim();
                      const value = values[key]?.trim();
                      return value ? (
                        <span
                          key={i}
                          className="text-[var(--primary)] font-semibold"
                        >
                          {value}
                        </span>
                      ) : (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded-md border border-dashed border-[var(--primary)]/40 text-[var(--primary)]/60 text-xs"
                        >
                          {segment}
                        </span>
                      );
                    }
                    return <span key={i}>{segment}</span>;
                  })}
                </p>
              </div>

              {/* Fields */}
              {fields.length > 0 && (
                <div className="space-y-5">
                  {fields.map((field, idx) => (
                    <motion.div
                      key={field}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                    >
                      <label className="flex items-center gap-2 mb-2">
                        <span className="text-[9px] font-mono font-bold text-[var(--primary)]">
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                        <span
                          className="text-[10px] font-mono uppercase tracking-[0.2em]"
                          style={{ color: 'var(--secondary-text)' }}
                        >
                          {field}
                        </span>
                      </label>
                      <input
                        type="text"
                        value={values[field] ?? ''}
                        onChange={(e) => handleFieldChange(field, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const nextIdx = idx + 1;
                            if (nextIdx < fields.length) {
                              const nextInput = e.currentTarget
                                .closest('.space-y-5')
                                ?.querySelectorAll('input')[nextIdx];
                              (nextInput as HTMLInputElement | undefined)?.focus();
                            } else {
                              handleApply();
                            }
                          }
                        }}
                        placeholder={`e.g. ${field}`}
                        className="w-full bg-black/50 border border-white/8 outline-none text-sm font-mono px-5 py-3.5 placeholder:text-white/15 transition-all duration-200 focus:border-[var(--primary)]/50 focus:bg-black/70 focus:shadow-[0_0_20px_-5px_rgba(245,158,11,0.15)] rounded-lg"
                        style={{ color: 'var(--foreground)' }}
                        autoFocus={idx === 0}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              className="px-8 py-5 border-t border-white/5 flex items-center justify-between gap-4"
              style={{ backgroundColor: 'rgba(255,255,255,0.01)' }}
            >
              <p
                className="text-[8px] font-mono uppercase tracking-[0.2em] hidden sm:block"
                style={{ color: 'var(--muted-text)' }}
              >
                [Enter] next field · [Enter] on last to apply
              </p>
              <div className="flex items-center gap-3 ml-auto">
                <button
                  onClick={() => onOpenChange(false)}
                  className="px-5 py-2.5 text-[10px] font-mono uppercase tracking-[0.2em] border border-white/10 rounded-md text-[var(--secondary-text)] hover:text-[var(--foreground)] hover:border-white/20 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApply}
                  className="px-6 py-2.5 text-[10px] font-mono font-black uppercase tracking-[0.2em] rounded-md border border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] hover:shadow-[0_8px_25px_-5px_rgba(245,158,11,0.4)] hover:-translate-y-[1px] active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
                >
                  Apply Template
                  <ArrowRight size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
