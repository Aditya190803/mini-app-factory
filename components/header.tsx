'use client';

export default function Header() {
  return (
    <header 
      className="border-b sticky top-0 z-50 backdrop-blur-md"
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      <div className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded flex items-center justify-center font-display text-2xl font-black"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            ⚙
          </div>
          <div>
            <h1 
              className="text-2xl font-display font-black uppercase tracking-tight"
              style={{ color: 'var(--foreground)' }}
            >
              Mini App Factory
            </h1>
            <p 
              className="text-xs font-mono"
              style={{ color: 'var(--secondary-text)' }}
            >
              Industrial AI Website Generator
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span 
            className="text-xs font-mono px-3 py-1.5 uppercase font-semibold border"
            style={{
              color: 'var(--primary)',
              borderColor: 'var(--primary)',
              backgroundColor: 'rgba(245, 158, 11, 0.05)',
            }}
          >
            BETA
          </span>
        </div>
      </div>
    </header>
  );
}
