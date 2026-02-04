'use client';

export default function SupportPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-4xl mx-auto px-6 py-12 space-y-6">
        <h1 className="text-2xl font-display font-black uppercase tracking-[0.2em]" style={{ color: 'var(--foreground)' }}>
          Support
        </h1>
        <p className="text-sm font-sans text-[var(--secondary-text)]">
          Need help? Use the project repository to report issues and request help.
        </p>
        <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-2">
          <p>GitHub: `https://github.com/Aditya190803/mini-app-factory`</p>
          <p>Include your project name, a short description of the issue, and steps to reproduce.</p>
        </div>
      </div>
    </div>
  );
}
