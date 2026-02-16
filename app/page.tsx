import { Suspense } from 'react';
import Link from 'next/link';
import { FactoryIcon } from "@/components/ui/factory-icon";
import AccountMenu from "@/components/account-menu";
import HomeForm from "@/components/home-form";

export default function Home() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: 'var(--background)' }}
    >
      {/* Ambient Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-1/2 -left-1/2 w-full h-full rounded-full blur-3xl opacity-5"
          style={{ backgroundColor: 'var(--primary)' }}
        />
        <div
          className="absolute -bottom-1/2 -right-1/2 w-full h-full rounded-full blur-3xl opacity-5"
          style={{ backgroundColor: 'var(--secondary)' }}
        />
      </div>

      {/* Header — server-rendered with client island for AccountMenu */}
      <header
        className="relative z-50 border-b backdrop-blur-xl"
        style={{
          backgroundColor: 'rgba(10, 10, 10, 0.5)',
          borderColor: 'var(--border)'
        }}
      >
        <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div
              className="w-10 h-10 flex items-center justify-center rounded-sm rotate-45 border border-[var(--primary)]"
              style={{
                backgroundColor: 'rgba(245, 158, 11, 0.1)',
                color: 'var(--primary)'
              }}
            >
              <div className="-rotate-45">
                <FactoryIcon size={20} />
              </div>
            </div>
            <div>
              <h1
                className="text-lg font-display font-black uppercase tracking-[0.3em] leading-none"
                style={{ color: 'var(--foreground)' }}
              >
                Mini App Factory
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--success)] animate-pulse" />
                <p
                  className="text-[11px] font-mono uppercase tracking-[0.2em]"
                  style={{ color: 'var(--muted-text)' }}
                >
                  System Status: Operational
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-8">
            <nav className="hidden md:flex items-center gap-6">
              <Link
                href="/dashboard"
                className="text-[10px] font-mono uppercase tracking-widest text-[var(--secondary-text)] hover:text-[var(--primary)] transition-colors"
              >
                Dashboard
              </Link>
            </nav>

            <div className="h-4 w-[1px] bg-[var(--border)] hidden md:block" />

            <Suspense fallback={<div className="h-8 w-8 rounded-full bg-white/5 animate-pulse" />}>
              <AccountMenu />
            </Suspense>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-4xl">
          {/* Hero — static server-rendered content */}
          <div className="text-center mb-10 relative">
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-40 h-[1px] bg-gradient-to-r from-transparent via-[var(--primary)] to-transparent opacity-50" />
            <h2
              className="text-4xl md:text-6xl font-display font-black uppercase tracking-tighter mb-4 leading-none"
              style={{ color: 'var(--foreground)' }}
            >
              Fabricate Your
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-b from-[var(--primary)] to-[var(--primary-hover)]">Vision</span>
            </h2>
            <p
              className="text-sm max-w-xl mx-auto leading-relaxed opacity-60 font-mono uppercase tracking-widest text-[11px]"
              style={{ color: 'var(--secondary-text)' }}
            >
              Our autonomous fabrication engine builds production-grade
              interfaces from high-level specifications.
            </p>
          </div>

          {/* Interactive form — client island */}
          <Suspense fallback={
            <div className="border backdrop-blur-sm rounded-2xl overflow-hidden border-white/5 p-8 animate-pulse" style={{ backgroundColor: 'rgba(18, 18, 18, 0.8)' }}>
              <div className="space-y-8">
                <div className="h-14 bg-white/5 rounded-lg" />
                <div className="h-48 bg-white/5 rounded-lg" />
              </div>
            </div>
          }>
            <HomeForm />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
