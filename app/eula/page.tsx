'use client';

export default function EulaPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-3">
          <h1 className="text-2xl font-display font-black uppercase tracking-[0.2em]" style={{ color: 'var(--foreground)' }}>
            End User License Agreement
          </h1>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted-text)]">
            Effective Date: February 4, 2026
          </div>
          <p className="text-sm font-sans text-[var(--secondary-text)] max-w-3xl">
            By accessing or using Mini App Factory, you agree to the terms below.
          </p>
        </div>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            License Grant
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>We grant you a limited, non-exclusive, revocable license to use the product for creating and managing your projects.</p>
            <p>You may export and deploy generated content to your own infrastructure or providers you control.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Your Responsibilities
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>You are responsible for the content you generate, publish, or deploy using the product.</p>
            <p>You must ensure you have rights to any assets, code, or data you upload or generate.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Third-Party Services
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>Deployments can be made through GitHub/Netlify integrations or via the hosted publishing option.</p>
            <p>Your use of third-party services is subject to their own terms and policies.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Availability and Changes
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>The product is provided “as is” and may change or be discontinued at any time.</p>
            <p>We may update these terms periodically; continued use indicates acceptance.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Contact
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)]">
            Questions about these terms? Reach out via the Support page.
          </div>
        </section>
      </div>
    </div>
  );
}
