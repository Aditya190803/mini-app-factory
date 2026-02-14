'use client';

import { useEffect } from 'react';

export default function PreviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Preview error:', error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div
          className="w-16 h-16 mx-auto border flex items-center justify-center text-2xl rounded-full"
          style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
        >
          !
        </div>
        <div className="space-y-2">
          <h2
            className="text-sm font-mono uppercase font-black tracking-widest"
            style={{ color: 'var(--foreground)' }}
          >
            Preview Error
          </h2>
          <p
            className="text-xs font-mono leading-relaxed"
            style={{ color: 'var(--muted-text)' }}
          >
            {error.message || 'Failed to load the preview. Please try again.'}
          </p>
        </div>
        <button
          onClick={reset}
          className="px-6 h-10 font-mono uppercase text-xs font-bold tracking-widest border-2 transition-all duration-200"
          style={{
            borderColor: 'var(--primary)',
            color: 'var(--primary)',
            backgroundColor: 'transparent',
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
