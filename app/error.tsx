'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useMemo } from 'react';

function classifyError(error: Error): {
  title: string;
  suggestion: string;
  icon: string;
} {
  const msg = error.message.toLowerCase();

  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed to load')) {
    return {
      title: 'Network Error',
      suggestion: 'Check your internet connection and try again.',
      icon: '⚡',
    };
  }
  if (msg.includes('unauthorized') || msg.includes('authentication') || msg.includes('sign in')) {
    return {
      title: 'Authentication Error',
      suggestion: 'Your session may have expired. Try signing in again.',
      icon: '🔒',
    };
  }
  if (msg.includes('rate limit') || msg.includes('too many requests')) {
    return {
      title: 'Rate Limited',
      suggestion: 'You\'re sending requests too quickly. Wait a moment and try again.',
      icon: '⏳',
    };
  }
  if (msg.includes('ai') || msg.includes('model') || msg.includes('provider') || msg.includes('generation')) {
    return {
      title: 'AI Provider Error',
      suggestion: 'The AI service may be temporarily unavailable. Try again or switch providers in settings.',
      icon: '🤖',
    };
  }

  return {
    title: 'Something went wrong',
    suggestion: 'An unexpected error occurred. Please try again.',
    icon: '!',
  };
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const classified = useMemo(() => classifyError(error), [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div
          className="w-16 h-16 mx-auto border flex items-center justify-center text-2xl rounded-full"
          style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
        >
          {classified.icon}
        </div>
        <div className="space-y-2">
          <h2
            className="text-sm font-mono uppercase font-black tracking-widest"
            style={{ color: 'var(--foreground)' }}
          >
            {classified.title}
          </h2>
          <p
            className="text-xs font-mono leading-relaxed"
            style={{ color: 'var(--muted-text)' }}
          >
            {classified.suggestion}
          </p>
          {error.digest && (
            <p
              className="text-[10px] font-mono"
              style={{ color: 'var(--muted-text)' }}
            >
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 h-10 font-mono uppercase text-xs font-bold tracking-widest border-2 transition-all duration-200"
            style={{
              borderColor: 'var(--primary)',
              color: 'var(--primary)',
              backgroundColor: 'transparent',
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => (window.location.href = '/dashboard')}
            className="px-6 h-10 font-mono uppercase text-xs font-bold tracking-widest border-2 transition-all duration-200"
            style={{
              borderColor: 'var(--muted-text)',
              color: 'var(--muted-text)',
              backgroundColor: 'transparent',
            }}
          >
            Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}
