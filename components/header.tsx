import { FactoryIcon } from "@/components/ui/factory-icon";

export default function Header() {
  return (
    <header 
      className="border-b sticky top-0 z-50 backdrop-blur-md"
      style={{
        backgroundColor: 'var(--background)',
        borderColor: 'var(--border)',
      }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[100] focus:top-2 focus:left-2 focus:px-4 focus:py-2 focus:bg-[var(--primary)] focus:text-[var(--primary-foreground)] focus:font-mono focus:text-xs focus:uppercase"
      >
        Skip to content
      </a>
      <div className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded flex items-center justify-center"
            style={{
              backgroundColor: 'var(--primary)',
              color: 'var(--primary-foreground)',
            }}
          >
            <FactoryIcon size={32} />
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
      </div>
    </header>
  );
}
