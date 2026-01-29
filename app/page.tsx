'use client';

import { useState } from 'react';
import PromptPanel from '@/components/prompt-panel';
import PreviewPanel from '@/components/preview-panel';
import Header from '@/components/header';

export default function Home() {
  const [generatedHTML, setGeneratedHTML] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>('');

  const handleGenerate = async (prompt: string) => {
    setIsLoading(true);
    setError('');
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Generation failed');
      }
      const data = await response.json();
      setGeneratedHTML(data.html);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      setError(errorMessage);
      console.error('Error generating website:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <PromptPanel onGenerate={handleGenerate} isLoading={isLoading} error={error} />
        <PreviewPanel html={generatedHTML} />
      </div>
    </div>
  );
}
