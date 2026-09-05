'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from "@stackframe/stack";
import { ArrowUpIcon, ArrowUpRightIcon, WarningIcon, LinkIcon } from '@phosphor-icons/react';
import { SiteHeader, SiteHeaderLink } from '@/components/site-header';
import { ThemeSwitcher } from "@/components/theme-switcher";
import { cn } from "@/lib/utils";
import AccountMenu from "@/components/account-menu";
import { withAIAdminHeaders, getStoredSelectedModel, setStoredSelectedModel } from '@/lib/ai-admin-client';
import { ModelSelector } from '@/components/ui/model-selector';
import { isHttpUrl } from '@/lib/url-reference';
import { WorkshopBackground } from '@/components/workshop-background';
import { APP_NAME, EXAMPLE_PROMPTS } from '@/lib/constants';

const DRAFT_KEY = 'maf:landing-draft';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [showReferenceUrl, setShowReferenceUrl] = useState(false);
  const [selectedModel, setSelectedModel] = useState<{ id: string, providerId: string }>({ id: '', providerId: '' });
  const [modelHydrated, setModelHydrated] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const user = useUser();

  const refId = useId();
  const promptId = useId();
  const errorId = useId();

  const slugify = (text: string, suffix: string) => {
    const base = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/g, '');
    return `${base || 'app'}-${suffix}`;
  };
  const randomSuffix = () => Math.random().toString(36).slice(2, 6);

  useEffect(() => {
    try {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        const saved = JSON.parse(draft) as {
          prompt?: string;
          referenceUrl?: string;
        };
        if (saved.prompt) setPrompt(saved.prompt);
        if (saved.referenceUrl) {
          setReferenceUrl(saved.referenceUrl);
          setShowReferenceUrl(true);
        }
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch {
    }
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
    setSelectedModel(getStoredSelectedModel());
    setModelHydrated(true);
  }, []);

  useEffect(() => {
    if (!modelHydrated) return;
    setStoredSelectedModel(selectedModel);
  }, [selectedModel, modelHydrated]);

  const handleStart = async () => {
    setError('');

    if (!prompt.trim()) {
      setError('Describe what you want to build.');
      return;
    }

    if (isChecking) return;

    if (!user) {
      try {
        sessionStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ prompt, referenceUrl }),
        );
      } catch {
        // Private mode / storage disabled: proceed without the draft.
      }
      router.push(
        `/handler/sign-in?after_auth_return_to=${encodeURIComponent('/')}`,
      );
      return;
    }

    const trimmedReferenceUrl = referenceUrl.trim();
    if (trimmedReferenceUrl && !isHttpUrl(trimmedReferenceUrl)) {
      setError('Reference URL must start with http:// or https://');
      return;
    }

    setIsChecking(true);

    try {
      let lastError = 'We couldn’t start that project. Try again.';
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const name = slugify(prompt, randomSuffix());
        const response = await fetch('/api/check-name', {
          method: 'POST',
          headers: withAIAdminHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            name,
            prompt: prompt.trim(),
            referenceUrl: trimmedReferenceUrl || undefined,
            selectedModel: selectedModel.id || undefined,
            providerId: selectedModel.providerId || undefined,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          router.push(`/edit/${data.name}`);
          return;
        }

        const errorData = await response.json().catch(() => ({}));
        lastError = errorData.error || lastError;
        if (response.status !== 409) break;
      }
      throw new Error(lastError);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Something went wrong. Try again.';
      setError(errorMessage);
      setIsChecking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleStart();
    }
  };

  const canSubmit = !isChecking;

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteHeader title={APP_NAME}>
        <SiteHeaderLink href="/docs">Docs</SiteHeaderLink>
        {user && <SiteHeaderLink href="/dashboard">Projects</SiteHeaderLink>}
        <ThemeSwitcher className="mx-1 hidden sm:inline-flex" />
        <AccountMenu />
      </SiteHeader>

      <main id="main" className="relative flex-1">
        <WorkshopBackground />
        <div className="relative mx-auto w-full max-w-3xl px-6 py-16 sm:py-24">
          <div>
            <p className="text-center font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Mini App Factory · Workshop
            </p>
            <h1 className="mt-3 text-balance text-center text-4xl font-semibold tracking-tight sm:text-5xl">
              Describe an app. Get a working one.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-center text-base leading-relaxed text-muted-foreground">
              Write what you need in plain language. You get the files, a live
              preview, and a deploy you can inspect at every step.
            </p>
          </div>

          <div className="mt-10 space-y-3">
            {error && (
              <div
                id={errorId}
                role="alert"
                className="flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in slide-in-from-top-1 duration-200"
              >
                <WarningIcon size={16} weight="fill" className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {/* Composer — the primary object on the page. */}
            <div className="composer-surface border border-border/60 focus-within:border-ring/60">
              <label htmlFor={promptId} className="sr-only">
                What should this app do?
              </label>
              <textarea
                ref={textareaRef}
                id={promptId}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="A tool that tracks freelance invoices, flags overdue ones, and charts monthly income…"
                disabled={isChecking}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? errorId : undefined}
                className="max-h-64 min-h-32 w-full resize-none bg-transparent px-3 py-2.5 text-base leading-relaxed outline-none placeholder:text-muted-foreground/70 disabled:opacity-60"
              />

              {showReferenceUrl && (
                <div className="space-y-1.5 border-t border-border/60 px-1 pt-2.5">
                  <label htmlFor={refId} className="block text-xs font-medium text-muted-foreground">
                    Reference URL — a site to take visual cues from
                  </label>
                  <input
                    id={refId}
                    type="url"
                    value={referenceUrl}
                    onChange={(e) => setReferenceUrl(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="https://example.com"
                    disabled={isChecking}
                    autoFocus
                    className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition-[border-color,box-shadow] placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:opacity-60"
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-2 px-1 pb-0.5 pt-1.5">
                <div className="flex min-w-0 items-center gap-1">
                  {!showReferenceUrl && (
                    <button
                      type="button"
                      onClick={() => setShowReferenceUrl(true)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <LinkIcon size={13} />
                      Reference a site
                    </button>
                  )}
                  <ModelSelector
                    selectedModelId={selectedModel.id}
                    providerId={selectedModel.providerId}
                    onModelChange={(id, providerId) => setSelectedModel({ id, providerId })}
                  />
                </div>

                <div className="flex items-center gap-2.5">
                  <kbd className="hidden text-xs text-muted-foreground sm:block">
                    ⌘↵
                  </kbd>
                  <button
                    type="button"
                    onClick={handleStart}
                    disabled={!canSubmit}
                    aria-label="Build this app"
                    className={cn(
                      'grid size-9 place-items-center rounded-full transition-all duration-200',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                      canSubmit
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95'
                        : 'cursor-not-allowed bg-muted text-muted-foreground',
                    )}
                  >
                    {isChecking ? (
                      <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <ArrowUpIcon size={18} weight="bold" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <section
            aria-labelledby="starters-heading"
            className="mt-12"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="starters-heading" className="text-sm font-medium text-muted-foreground">
                Not sure where to start?
              </h2>
              <p className="hidden font-mono text-xs text-muted-foreground/70 sm:block">
                Pick one to fill the composer
              </p>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {EXAMPLE_PROMPTS.map((example) => (
                <button
                  key={example}
                  type="button"
                  title={example}
                  onClick={() => {
                    setPrompt(example);
                    textareaRef.current?.focus();
                  }}
                  className="group flex items-start justify-between gap-2 rounded-xl border border-border/60 bg-card px-3.5 py-2.5 text-left text-[13px] leading-snug text-muted-foreground transition-colors duration-150 hover:border-foreground/20 hover:bg-muted/60 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="line-clamp-2">{example}</span>
                  <ArrowUpRightIcon size={14} className="mt-0.5 shrink-0 text-muted-foreground/50 transition-all duration-150 group-hover:translate-x-px group-hover:text-foreground" />
                </button>
              ))}
            </div>
          </section>

          <section aria-labelledby="how-heading" className="mt-16">
            <h2 id="how-heading" className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              How it works
            </h2>
            <ol className="mt-4 divide-y divide-border border-y border-border">
              <li className="grid gap-1 py-4 sm:grid-cols-[3rem_1fr] sm:gap-4">
                <span aria-hidden className="font-mono text-sm text-muted-foreground/70">01</span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">Describe</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Write the app in plain language. Reference a site for visual cues if you have one.</p>
                </div>
              </li>
              <li className="grid gap-1 py-4 sm:grid-cols-[3rem_1fr] sm:gap-4">
                <span aria-hidden className="font-mono text-sm text-muted-foreground/70">02</span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">Inspect</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Read the files, click through the preview, and refine with follow-up prompts. Every version is kept.</p>
                </div>
              </li>
              <li className="grid gap-1 py-4 sm:grid-cols-[3rem_1fr] sm:gap-4">
                <span aria-hidden className="font-mono text-sm text-muted-foreground/70">03</span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-tight">Deploy</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">Ship to hosting or export the code. You confirm before anything billable happens.</p>
                </div>
              </li>
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
