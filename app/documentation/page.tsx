'use client';

import Link from "next/link";

export default function DocumentationPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-2xl font-display font-black uppercase tracking-[0.2em]" style={{ color: 'var(--foreground)' }}>
          Documentation
        </h1>
        <p className="text-sm font-sans text-[var(--secondary-text)]">
          Looking for the full docs? Visit the main documentation page.
        </p>
        <Link
          href="/docs"
          className="inline-flex px-4 py-2 text-[10px] font-mono uppercase border border-[var(--border)] text-[var(--primary)] hover:border-[var(--primary)]"
        >
          Open Docs
        </Link>
      </div>
    </div>
  );
}
