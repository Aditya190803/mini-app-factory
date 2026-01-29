'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EditorWorkspace from '@/components/editor-workspace';
import { ProjectMetadata } from '@/lib/projects';

interface ProjectViewProps {
  projectName: string;
  initialProject: ProjectMetadata;
}

type Step = {
  id: string;
  label: string;
  status: 'pending' | 'loading' | 'completed' | 'error';
};

export default function ProjectView({ projectName, initialProject }: ProjectViewProps) {
  const [project, setProject] = useState<ProjectMetadata>(initialProject);
  const [steps, setSteps] = useState<Step[]>([
    { id: 'initializing', label: 'Initializing project structure', status: 'pending' },
    { id: 'designing', label: 'Developing design aesthetic', status: 'pending' },
    { id: 'fabricating', label: 'Fabricating production code', status: 'pending' },
  ]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (project.status === 'completed' || hasStarted.current) return;
    
    startGeneration();
  }, [project.status]);

  // Poll for project status as a fallback when stream fails
  async function pollForCompletion(): Promise<boolean> {
    for (let i = 0; i < 60; i++) { // Poll for up to 5 minutes
      await new Promise(r => setTimeout(r, 5000));
      try {
        const res = await fetch(`/api/project/${projectName}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'completed' && data.html) {
            setProject(prev => ({ ...prev, status: 'completed', html: data.html }));
            setSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
            return true;
          } else if (data.status === 'error') {
            setError(data.error || 'Generation failed');
            return true;
          }
        }
      } catch {
        // Continue polling
      }
    }
    return false;
  }

  async function startGeneration() {
    hasStarted.current = true;
    setError(null);

    let streamFailed = false;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout
      
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, prompt: project.prompt }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to start generation');
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No readable stream');

      const decoder = new TextDecoder();
      let buffer = '';
      
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          
          const messages = buffer.split('\n\n');
          buffer = messages.pop() || '';

          for (const message of messages) {
            const line = message.trim();
            if (!line || !line.startsWith('data: ')) continue;
            
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.status === 'ping') continue;
              
              if (data.status === 'error') {
                setError(data.error);
                reader.cancel().catch(() => {});
                return;
              }

              if (data.status === 'completed') {
                setProject(prev => ({ ...prev, status: 'completed', html: data.html }));
                setSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
                return;
              }

              setSteps(prev => prev.map((step, idx) => {
                if (step.id === data.status) {
                  setCurrentStepIndex(idx);
                  return { ...step, status: 'loading' };
                }
                if (idx < prev.findIndex(s => s.id === data.status)) {
                  return { ...step, status: 'completed' };
                }
                return step;
              }));
            } catch {
              // Skip malformed messages
            }
          }
        }
      } catch (readError) {
        // Stream read failed - fall back to polling
        console.warn('Stream interrupted, falling back to polling...');
        streamFailed = true;
      }
      
      // Process remaining buffer
      if (buffer.trim() && buffer.startsWith('data: ')) {
        try {
          const data = JSON.parse(buffer.slice(6));
          if (data.status === 'completed') {
            setProject(prev => ({ ...prev, status: 'completed', html: data.html }));
            setSteps(prev => prev.map(s => ({ ...s, status: 'completed' })));
            return;
          } else if (data.status === 'error') {
            setError(data.error);
            return;
          }
        } catch { /* ignore */ }
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        streamFailed = true;
      } else {
        console.error('Generation fetch error:', err);
        streamFailed = true;
      }
    }

    // If stream failed or ended without completion, poll the API
    if (streamFailed) {
      setSteps(prev => prev.map((s, i) => i <= 1 ? { ...s, status: 'completed' } : { ...s, status: 'loading' }));
      const completed = await pollForCompletion();
      if (!completed) {
        setError('Generation timed out. Please try again.');
      }
    }
  }

  if (project.status === 'completed' && project.html) {
    return (
      <EditorWorkspace 
        initialHTML={project.html} 
        initialPrompt={project.prompt} 
        projectName={projectName}
        onBack={() => window.location.href = '/'} 
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 bg-grid">
      <div className="w-full max-w-2xl">
        <div className="mb-12 text-center space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-block px-3 py-1 border border-primary/20 bg-primary/5 text-primary text-xs font-mono mb-2"
          >
            PROJECT: {projectName.toUpperCase()}
          </motion.div>
          <h1 className="text-4xl md:text-5xl font-display font-black tracking-tighter">
            FABRICATING YOUR VISION
          </h1>
          <p className="text-secondary-text font-mono text-sm max-w-md mx-auto">
            Our autonomous agents are building your application step by step.
          </p>
        </div>

        <div className="space-y-6">
          {steps.map((step, index) => (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-6 border flex items-center justify-between transition-colors ${
                step.status === 'loading' ? 'border-primary bg-primary/5 shadow-neon' : 
                step.status === 'completed' ? 'border-secondary-text/20 bg-transparent opacity-50' : 
                'border-border bg-transparent opacity-30'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="font-mono text-xs opacity-40">0{index + 1}</div>
                <div>
                  <div className={`font-mono text-sm uppercase tracking-widest ${step.status === 'loading' ? 'text-primary' : ''}`}>
                    {step.label}
                  </div>
                  {step.status === 'loading' && (
                    <motion.div 
                      className="text-xs text-secondary-text/60 mt-1"
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      Working...
                    </motion.div>
                  )}
                </div>
              </div>

              <div className="flex items-center">
                {step.status === 'loading' ? (
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                ) : step.status === 'completed' ? (
                  <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <div className="w-2 h-2 rounded-full bg-border" />
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8 p-4 border border-red-500/50 bg-red-500/10 text-red-500 text-sm font-mono text-center"
          >
            ERROR: {error}
            <button 
              onClick={() => { hasStarted.current = false; startGeneration(); }}
              className="block mx-auto mt-2 underline"
            >
              Retry
            </button>
          </motion.div>
        )}

        <div className="mt-12 pt-8 border-t border-border flex justify-between items-center text-[10px] font-mono text-muted-text uppercase tracking-widest">
          <div>Autonomous Construction</div>
          <div className="flex gap-4">
            <span>Model: GPT-5-MINI</span>
            <span>Ver: 1.0.4</span>
          </div>
        </div>
      </div>
    </div>
  );
}
