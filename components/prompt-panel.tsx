'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';

interface PromptPanelProps {
  onGenerate: (prompt: string) => Promise<void>;
  isLoading: boolean;
  error?: string;
}

export default function PromptPanel({ onGenerate, isLoading, error }: PromptPanelProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = async () => {
    if (!prompt.trim()) return;
    await onGenerate(prompt);
  };

  const isTokenMissing = error?.includes('GITHUB_TOKEN');

  const examplePrompts = [
    'A modern SaaS landing page for a project management tool with hero, features, pricing, and CTA',
    'An e-commerce product page with image gallery, reviews, and add to cart button',
    'A portfolio website showcasing design work with a grid layout and case studies',
  ];

  return (
    <div 
      className="w-full md:w-1/2 border-r flex flex-col"
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {error && (
          <div 
            className="p-4 border text-sm space-y-3"
            style={{
              backgroundColor: 'rgba(239, 68, 68, 0.05)',
              borderColor: 'var(--error)',
              color: 'var(--error)',
            }}
          >
            <div className="font-mono font-semibold text-xs uppercase">Configuration Error</div>
            <p className="text-xs leading-relaxed">{error}</p>
            {isTokenMissing && (
              <div 
                className="text-xs p-3 border mt-3 space-y-2"
                style={{
                  backgroundColor: 'rgba(245, 158, 11, 0.03)',
                  borderColor: 'var(--border)',
                  color: 'var(--secondary-text)',
                }}
              >
                <p className="font-mono font-semibold">SETUP INSTRUCTIONS:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Go to <a href="https://github.com/settings/tokens/new" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: 'var(--secondary)' }}>github.com/settings/tokens/new</a></li>
                  <li>Create a Personal Access Token (classic)</li>
                  <li>Click "Vars" in the left sidebar</li>
                  <li>Add <code style={{ color: 'var(--primary)' }} className="font-mono">GITHUB_TOKEN</code> with your token value</li>
                </ol>
              </div>
            )}
          </div>
        )}
        
        <div>
          <label 
            className="block text-xs font-mono uppercase font-semibold mb-3 tracking-widest"
            style={{ color: 'var(--secondary-text)' }}
          >
            Describe Your Website
          </label>
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="A modern SaaS landing page with hero section, features showcase, pricing table, and testimonials. Use a clean design with blue accents..."
            className="min-h-40 resize-none text-base leading-relaxed font-sans"
            style={{
              backgroundColor: 'var(--background-overlay)',
              borderColor: 'var(--border)',
              color: 'var(--foreground)',
            }}
            disabled={isLoading}
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={!prompt.trim() || isLoading}
          className="w-full h-12 font-mono font-black uppercase tracking-widest text-sm transition-all duration-200 border-2"
          style={{
            backgroundColor: !prompt.trim() || isLoading ? 'var(--border)' : 'var(--primary)',
            color: !prompt.trim() || isLoading ? 'var(--muted-text)' : 'var(--primary-foreground)',
            borderColor: !prompt.trim() || isLoading ? 'var(--border)' : 'var(--primary)',
            cursor: !prompt.trim() || isLoading ? 'not-allowed' : 'pointer',
            opacity: !prompt.trim() || isLoading ? 0.6 : 1,
          }}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner className="w-4 h-4" />
              Fabricating...
            </span>
          ) : (
            'Generate'
          )}
        </button>

        <div>
          <h3 
            className="text-xs font-mono uppercase font-black tracking-widest mb-4"
            style={{ color: 'var(--secondary-text)' }}
          >
            Sample Prompts
          </h3>
          <div className="space-y-2">
            {examplePrompts.map((example, idx) => (
              <button
                key={idx}
                onClick={() => setPrompt(example)}
                className="block w-full text-left p-4 border transition-all duration-200 text-sm hover:-translate-y-1"
                style={{
                  backgroundColor: 'var(--background-overlay)',
                  borderColor: 'var(--border)',
                  color: 'var(--secondary-text)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--foreground)';
                  e.currentTarget.style.borderColor = 'var(--primary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--secondary-text)';
                  e.currentTarget.style.borderColor = 'var(--border)';
                }}
              >
                <div className="flex items-start gap-3 font-sans">
                  <span className="text-xs font-black mt-0.5" style={{ color: 'var(--primary)' }}>→</span>
                  <span className="text-xs leading-relaxed">{example}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div 
        className="border-t px-8 py-4 backdrop-blur-sm"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--background-overlay)',
        }}
      >
        <div className="flex items-center gap-3 text-xs font-mono" style={{ color: 'var(--secondary-text)' }}>
          <div 
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: 'var(--primary)' }}
          ></div>
          <span>GITHUB COPILOT • GPT-4 MINI</span>
        </div>
      </div>
    </div>
  );
}
