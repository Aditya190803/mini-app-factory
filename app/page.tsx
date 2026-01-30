'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useUser } from "@stackframe/stack";
import AIStatusBadge from '@/components/ai-status-badge';

export default function Home() {
  const [prompt, setPrompt] = useState('');
  const [projectName, setProjectName] = useState('');
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
    if (!prompt.trim() || !projectName.trim() || isChecking) return;
    
    if (!user) {
      router.push('/handler/sign-in');
      return;
    }

    setIsChecking(true);
    setError('');
    
    try {
      const response = await fetch('/api/check-name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: projectName, prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Name check failed');
      }

      const data = await response.json();
      // Navigate to the edit page and do NOT clear the loading flag here.
      // Clearing `isChecking` immediately causes the button text to revert
      // briefly before the client navigation completes. Let the navigation
      // unmount this component instead.
      router.push(`/edit/${data.name}`);
      return;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      // Only clear the loading flag on error so the UI reflects failure.
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
        className="relative z-10 border-b backdrop-blur-md"
        style={{ 
          backgroundColor: 'rgba(10, 10, 10, 0.8)',
          borderColor: 'var(--border)' 
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              className="w-8 h-8 flex items-center justify-center font-black text-sm"
              style={{ 
                backgroundColor: 'var(--primary)', 
                color: 'var(--primary-foreground)' 
              }}
            >
              ⚙
            </div>
            <div>
              <h1 
                className="text-sm font-display font-black uppercase tracking-[0.2em]"
                style={{ color: 'var(--foreground)' }}
              >
                Mini App Factory
              </h1>
              <p 
                className="text-[10px] font-mono uppercase tracking-[0.1em]"
                style={{ color: 'var(--muted-text)' }}
              >
                Production Environment
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">

             {user ? (
               <div className="flex items-center gap-4">
                 <button 
                  onClick={() => router.push('/dashboard')}
                  className="text-[10px] font-mono uppercase font-bold text-[var(--secondary-text)] hover:text-white"
                 >
                   Dashboard
                 </button>
                 <button 
                  onClick={() => user.signOut()}
                  className="px-3 py-1 text-[10px] font-mono border border-[var(--border)] uppercase"
                 >
                   Sign Out
                 </button>
               </div>
             ) : (
               <button 
                 onClick={() => router.push('/handler/sign-in')}
                 className="px-3 py-1 text-[10px] font-mono border border-[var(--border)] uppercase hover:border-[var(--primary)] text-[var(--primary)]"
               >
                 Sign In
               </button>
             )}

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-12">
        <motion.div 
          className="w-full max-w-3xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        >
          {/* Hero */}
          <div className="text-center mb-10">
            <motion.h2 
              className="text-4xl md:text-5xl font-display font-black uppercase tracking-tight mb-4"
              style={{ color: 'var(--foreground)' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
            >
              Fabricate Your
              <span style={{ color: 'var(--primary)' }}> Vision</span>
            </motion.h2>
            <motion.p 
              className="text-base max-w-lg mx-auto leading-relaxed"
              style={{ color: 'var(--secondary-text)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 }}
            >
              Describe what you want to build. Our AI will generate a production-ready 
              static website in seconds.
            </motion.p>
          </div>

          {/* Prompt Input Card */}
          <motion.div 
            className="border backdrop-blur-sm"
            style={{ 
              backgroundColor: 'var(--background-surface)',
              borderColor: 'var(--border)',
            }}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            {/* Error Display */}
            <AnimatePresence>
              {error && (
                <motion.div 
                  className="p-4 border-b"
                  style={{ 
                    backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    borderColor: 'var(--error)',
                  }}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  <p className="text-sm" style={{ color: 'var(--error)' }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Textarea */}
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--secondary-text)' }}>Project Identifier</label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                  placeholder="project-001"
                  className="w-full bg-transparent border-b outline-none text-lg font-mono font-bold py-2 placeholder:opacity-10"
                  style={{ borderBottomColor: 'var(--border)', color: 'var(--foreground)' }}
                  disabled={isChecking}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-mono uppercase tracking-[0.2em]" style={{ color: 'var(--secondary-text)' }}>Input Specifications</label>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Enter high-level design requirements for the fabrication engine..."
                  className="w-full min-h-32 resize-none text-sm font-mono leading-relaxed bg-transparent border-0 outline-none placeholder:opacity-20"
                  style={{ color: 'var(--foreground)' }}
                  disabled={isChecking}
                />
              </div>
            </div>

            {/* Footer */}
            <div 
              className="flex items-center justify-between px-8 py-6 border-t"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-1 rounded-full bg-[var(--primary)] animate-pulse" />
                  <span 
                    className="text-[10px] font-mono uppercase tracking-widest"
                    style={{ color: 'var(--muted-text)' }}
                  >
                    Engine: GPT-5-Mini
                  </span>
                </div>
                
                <span 
                  className="text-[10px] font-mono uppercase hidden md:inline opacity-30"
                  style={{ color: 'var(--muted-text)' }}
                >
                  [Ctrl + Enter] to start fabrication
                </span>
              </div>

              <button
                onClick={handleStart}
                disabled={!prompt.trim() || !projectName.trim() || isChecking}
                className="px-8 py-3 font-mono font-black uppercase text-[10px] tracking-[0.2em] transition-all duration-300 border flex items-center gap-3 group"
                style={{
                  backgroundColor: !prompt.trim() || !projectName.trim() || isChecking ? 'transparent' : 'var(--primary)',
                  color: !prompt.trim() || !projectName.trim() || isChecking ? 'var(--muted-text)' : 'var(--primary-foreground)',
                  borderColor: !prompt.trim() || !projectName.trim() || isChecking ? 'var(--border)' : 'var(--primary)',
                  cursor: !prompt.trim() || !projectName.trim() || isChecking ? 'not-allowed' : 'pointer',
                }}
              >
                {isChecking ? 'Processing...' : (
                  <>
                    Initialize Fabrication
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>

          {/* Example Prompts */}
          <motion.div 
            className="mt-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <h3 
              className="text-xs font-mono uppercase font-semibold tracking-widest mb-4 text-center"
              style={{ color: 'var(--secondary-text)' }}
            >
              Try an Example
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {examplePrompts.map((example, idx) => (
                <motion.button
                  key={idx}
                  onClick={() => setPrompt(example)}
                  className="text-left p-4 border transition-all duration-200 group"
                  style={{
                    backgroundColor: 'var(--background-surface)',
                    borderColor: 'var(--border)',
                  }}
                  whileHover={{ 
                    y: -2,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <span 
                      className="text-sm font-black mt-0.5 transition-colors"
                      style={{ color: 'var(--primary)' }}
                    >
                      →
                    </span>
                    <span 
                      className="text-sm leading-relaxed transition-colors"
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

      {/* Footer */}
      <footer 
        className="relative z-10 border-t py-6"
        style={{ borderColor: 'var(--border)' }}
      >
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--muted-text)' }}>
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'var(--success)' }} />
              <span>OpenRouter AI</span>
            </div>

            <div>
              <AIStatusBadge />
            </div>
          </div>
          <p 
            className="text-xs font-mono"
            style={{ color: 'var(--muted-text)' }}
          >
             Production Ready
          </p>
        </div>
      </footer>
    </div>
  );
}
