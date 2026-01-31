'use client';

import React, { useEffect, useState } from 'react';

export default function AIStatusBadge() {
  const [status, setStatus] = useState<'unknown' | 'checking' | 'ok' | 'unavailable'>('unknown');
  const [message, setMessage] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    const POLL = 5000;

    async function check() {
      if (!mounted) return;
      setStatus('checking');
      try {
        const res = await fetch('/api/ai/status');
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (!mounted) return;
          setStatus('unavailable');
          setMessage(data?.error || res.statusText || 'Unavailable');
          return;
        }

        const data = await res.json();
        if (!mounted) return;
        setStatus(data?.status === 'ok' ? 'ok' : 'unavailable');
        setMessage(data?.message || data?.error || '');
      } catch (e) {
        if (!mounted) return;
        setStatus('unavailable');
        setMessage(String(e));
      }
    }

    check();
    const id = setInterval(check, POLL);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const color = status === 'ok' ? 'bg-[var(--success)]' : status === 'checking' ? 'bg-[var(--warning)]' : 'bg-[var(--error)]';
  const label = status === 'ok' ? 'AI: Online' : status === 'checking' ? 'AI: Checking' : 'AI: Unavailable';

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <span className={`w-2 h-2 rounded-full ${color}`} aria-hidden />
      <span title={message} className="text-[10px] text-[var(--muted-text)]">{label}</span>
    </div>
  );
}
