'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useUser } from "@stackframe/stack";
import { FactoryIcon } from "@/components/ui/factory-icon";
import { ModelSelector } from "@/components/ui/model-selector";
import { cn } from "@/lib/utils";
import { ArrowRight, Zap as ZapIcon } from 'lucide-react';
import AccountMenu from "@/components/account-menu";

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedModel, setSelectedModel] = useState<{ id: string, providerId: string }>({ id: '', providerId: '' });
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const user = useUser();

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);


  const handleStart = async () => {
    setError('');

    // Simple validation
    if (!projectName.trim()) {
      setError('Project identifier is required.');
      return;
    }

    if (projectName.length < 3) {
      setError('Project identifier must be at least 3 characters.');
      return;
    }

    if (!prompt.trim()) {
      setError('Please enter your project specifications.');
      return;
    }

    if (prompt.length < 10) {
      setError('Your prompt is a bit too short. Please provide more detail (at least 10 characters).');
      return;
    }

    if (isChecking) return;

    if (!user) {
      router.push('/handler/sign-in');
      return;
    }

    setIsChecking(true);

    try {
      const response = await fetch('/api/check-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name: projectName.trim(), 
          prompt: prompt.trim(),
          selectedModel: selectedModel.id || undefined,
          providerId: selectedModel.providerId || undefined
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Name check failed');
      }

      const data = await response.json();
      router.push(`/edit/${data.name}`);
      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setIsChecking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleStart();
    }
  };

  const examplePrompts = [
    'A brutalist portfolio for a creative director with bold typography and case study grid',
    'Minimal SaaS landing page for an AI writing tool with dark mode and gradient accents',
    'E-commerce product page for premium headphones with 3D-style hero and reviews',
    'Developer documentation site with sidebar navigation and code snippets',
  ];

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--background)' }}
    >
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-3xl opacity-5"
          style={{ backgroundColor: 'var(--primary)' }}
        />
        <div
          className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-3xl opacity-5"
          style={{ backgroundColor: 'var(--secondary)' }}
        />
      </div>

      {/* Header */}
      <header
        className="relative z-50 border-b backdrop-blur-xl"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.5)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 flex items-center justify-center rounded-sm rotate-45 border border-[var(--primary)]"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                color: 'var(--primary)'
              }}
            >
              <div className="-rotate-45">
                <FactoryIcon size={20} />
              </div>
            </div>
            <div>
              <h1
                className="text-lg font-display font-black uppercase tracking-[0.3em] leading-none"
                style={{ color: 'var(--foreground)' }}
              >
                Mini App Factory
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                <p
                  className="text-[9px] font-mono uppercase tracking-[0.2em]"
                  style={{ color: 'var(--muted-text)' }}
                >
                  System Status: Operational
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <nav className="hidden md:flex items-center gap-6">
              <button
                onClick={() => router.push('/dashboard')}
                className="text-[10px] font-mono uppercase tracking-widest text-[var(--secondary-text)] hover:text-[var(--primary)] transition-colors"
              >
                Dashboard
              </button>
            </nav>

            <div className="h-4 w-[1px] bg-[var(--border)] hidden md:block" />

            <AccountMenu />

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-8">
        <motion.div
          className="w-full max-w-4xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Hero */}
          <div className="text-center mb-10 relative">
             <motion.div 
               className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent opacity-50"
               initial={{ width: 0 }}
               animate={{ width: 160 }}
               transition={{ delay: 0.5, duration: 1 }}
             />
            <motion.h2
              className="text-4xl md:text-6xl font-display font-black uppercase tracking-tighter mb-4 leading-none"
              style={{ color: 'var(--foreground)' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Fabricate Your
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-[var(--primary)] to-[var(--primary-hover)]">Vision</span>
            </motion.h2>
            <motion.p
              className="text-sm max-w-xl mx-auto leading-relaxed opacity-60 font-mono uppercase tracking-widest text-[11px]"
              style={{ color: 'var(--secondary-text)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Our autonomous fabrication engine builds production-grade 
              interfaces from high-level specifications.
            </motion.p>
          </div>

          {/* Prompt Input Card */}
          <motion.div
            className="border backdrop-blur-sm rounded-2xl overflow-hidden shadow-[0_40px_100px_-20px_rgba(0,0,0,0.8)] border-white/5"
            style={{
              backgroundColor: 'rgba(18, 18, 18, 0.8)',
            }}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {/* Grid Pattern Overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />

            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="p-5 border-b flex items-center gap-3"
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    borderColor: 'rgba(239, 68, 68, 0.3)',
                  }}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--error)] animate-pulse" />
                  <p className="text-xs font-mono uppercase tracking-widest" style={{ color: 'var(--error)' }}>
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Textarea */}
            <div className="p-8 space-y-8 relative">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3 bg-[var(--primary)]" />
                  <label className="text-[10px] font-mono uppercase font-bold tracking-[0.3em]" style={{ color: 'var(--secondary-text)' }}>
                    01 // PROJECT_IDENTIFIER
                  </label>
                </div>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. neuro-pulse-v1"
                  className="w-full bg-black/40 border border-white/5 outline-none text-2xl font-mono font-bold px-6 py-4 placeholder:opacity-10 transition-all focus:border-[var(--primary)]/50 focus:bg-black/60 rounded-lg"
                  style={{ color: 'var(--foreground)' }}
                  disabled={isChecking}
                />
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-40">
                    System Unique UID
                  </p>
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-40">
                    [a-z0-9-] Only
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-3 bg-[var(--primary)]" />
                  <label className="text-[10px] font-mono uppercase font-bold tracking-[0.3em]" style={{ color: 'var(--secondary-text)' }}>
                    02 // INPUT_SPECIFICATIONS
                  </label>
                </div>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter detailed architectural requirements..."
                  className="w-full min-h-48 resize-none text-base font-mono leading-relaxed bg-black/40 border border-white/5 outline-none px-6 py-4 placeholder:opacity-10 transition-all focus:border-[var(--primary)]/50 focus:bg-black/60 rounded-lg"
                  style={{ color: 'var(--foreground)' }}
                  disabled={isChecking}
                />
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-40">
                    Visual + Functional Logic Params
                  </p>
                  <p className="text-[8px] font-mono uppercase tracking-[0.2em] opacity-30">
                    Ln {prompt.split('\n').length}, Col {prompt.length}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Bar */}
            <div
              className="flex flex-col md:flex-row items-center justify-between px-8 py-6 border-t gap-4"
              style={{ 
                borderColor: 'var(--border)',
                backgroundColor: 'rgba(255, 255, 255, 0.01)'
              }}
            >
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                <ModelSelector 
                  selectedModelId={selectedModel.id}
                  providerId={selectedModel.providerId}
                  onModelChange={(id, providerId) => setSelectedModel({ id, providerId })}
                />

              </div>

              <div className="flex flex-col items-center md:items-end gap-3 flex-1">
                <button
                  onClick={handleStart}
                  disabled={!prompt.trim() || !projectName.trim() || isChecking}
                  className={cn(
                    "w-full md:w-auto px-10 py-4 font-mono font-black uppercase text-[11px] tracking-[0.3em] transition-all duration-500 border flex items-center justify-center gap-4 group relative overflow-hidden rounded-md",
                    !prompt.trim() || !projectName.trim() || isChecking 
                      ? "bg-transparent border-[var(--border)] text-[var(--muted-text)]" 
                      : "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_15px_40px_-10px_rgba(245,158,11,0.5)] active:scale-[0.98] hover:translate-y-[-2px]"
                  )}
                >
                  <span className="relative z-10 flex items-center gap-3">
                    {isChecking ? (
                      <>
                        <div className="w-3 h-3 border-2 border-[var(--primary-foreground)] border-t-transparent animate-spin rounded-full" />
                        Analyzing Logic
                      </>
                    ) : (
                      <>
                        Initialize Fabrication
                        <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </span>
                  {!(!prompt.trim() || !projectName.trim() || isChecking) && (
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity" />
                  )}
                </button>
                
                <p className="text-[9px] font-mono uppercase tracking-widest opacity-40 text-center md:text-right">
                  [Ctrl + Enter] to bypass manual initialize
                </p>
              </div>
            </div>
          </motion.div>

          {/* Example Prompts */}
          <motion.div
            className="mt-12"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-[1px] bg-gradient-to-r from-transparent to-[var(--border)]" />
              <h3
                className="text-[9px] font-mono uppercase font-black tracking-[0.4em]"
                style={{ color: 'var(--secondary-text)' }}
              >
                Inspiration Modules
              </h3>
              <div className="flex-1 h-[1px] bg-gradient-to-l from-transparent to-[var(--border)]" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {examplePrompts.map((example, idx) => (
                <motion.button
                  key={idx}
                  onClick={() => setPrompt(example)}
                  className="text-left p-6 border border-white/5 rounded-xl transition-all duration-300 group hover:border-[var(--primary)]/30 hover:shadow-[0_10px_30px_-15px_rgba(245,158,11,0.2)]"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  }}
                  whileHover={{
                    y: -4,
                  }}
                  whileTap={{ scale: 0.98 }}
                >
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                       <span className="text-[8px] font-mono uppercase tracking-widest text-[var(--muted-text)] group-hover:text-[var(--primary)] transition-colors">
                        Template_0{idx + 1}
                      </span>
                      <ZapIcon size={10} className="text-[var(--muted-text)] group-hover:text-[var(--primary)] transition-colors" />
                    </div>
                    <span
                      className="text-[11px] leading-relaxed transition-colors font-mono tracking-tight"
                      style={{ color: 'var(--secondary-text)' }}
                    >
                      {example}
                    </span>
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </main>
    </div>
  );
}
