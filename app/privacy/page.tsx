'use client';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: 'var(--background)' }}>
      <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
        <div className="space-y-3">
          <h1 className="text-2xl font-display font-black uppercase tracking-[0.2em]" style={{ color: 'var(--foreground)' }}>
            Privacy Policy
          </h1>
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--muted-text)]">
            Effective Date: February 4, 2026
          </div>
          <p className="text-sm font-sans text-[var(--secondary-text)] max-w-3xl">
            This Privacy Policy explains how Mini App Factory collects, uses, and protects information when you use the product.
          </p>
        </div>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Information We Collect
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p><span className="text-[var(--secondary-text)]">Account data:</span> Authentication is handled by Stack. Your account identity (email and profile metadata) is stored and managed by that provider.</p>
            <p><span className="text-[var(--secondary-text)]">Project data:</span> Prompts, generated files, metadata/SEO settings, and deployment details are stored in Convex so you can edit, export, and deploy.</p>
            <p><span className="text-[var(--secondary-text)]">Integration data:</span> When you connect GitHub or Netlify, OAuth tokens are stored to enable deployments. You can disconnect integrations in Settings.</p>
            <p><span className="text-[var(--secondary-text)]">Usage signals:</span> We may process basic telemetry required for stability and error diagnosis (e.g., request errors).</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            How We Use Information
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>To provide core features: generating sites, saving projects, and enabling export/deploy workflows.</p>
            <p>To maintain security and prevent abuse, including verifying authenticated access to user data.</p>
            <p>To improve product reliability and performance.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Data Sharing
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>We use third-party infrastructure providers to run the product. These providers process data only to deliver services (hosting, authentication, storage, deployments).</p>
            <p>When you connect GitHub or Netlify, those providers receive data required to create repos and deploy sites under your account.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Data Retention
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>Project data is retained while your account is active to allow editing and redeploys. You can delete projects from the dashboard.</p>
            <p>Integration tokens can be removed at any time from Settings.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Your Choices
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)] space-y-3">
            <p>Disconnect integrations at any time in Settings.</p>
            <p>Delete projects from the dashboard to remove their stored data.</p>
          </div>
        </section>

        <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-4">
          <h2 className="text-xs font-mono uppercase tracking-widest text-[var(--secondary-text)]">
            Contact
          </h2>
          <div className="text-[11px] font-mono text-[var(--muted-text)]">
            For privacy questions or data requests, contact the team via the Support page.
          </div>
        </section>
      </div>
    </div>
  );
}
