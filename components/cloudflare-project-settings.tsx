'use client';

import { useEffect, useState } from 'react';
import { Database, Globe2, RotateCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Deployment = {
  _id: string;
  provider: string;
  createdAt: number;
  deploymentUrl?: string;
  cloudflareDeploymentId?: string;
};

type Props = {
  projectName: string;
  cloudflareProjectName?: string;
  d1DatabaseName?: string;
  customDomain?: string;
  deployments: Deployment[];
};

export default function CloudflareProjectSettings({
  projectName,
  cloudflareProjectName,
  d1DatabaseName,
  customDomain,
  deployments,
}: Props) {
  const [secretNames, setSecretNames] = useState<string[]>([]);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [domain, setDomain] = useState(customDomain ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDomain(customDomain ?? '');
  }, [customDomain]);

  useEffect(() => {
    fetch(`/api/cloudflare/secrets?projectName=${encodeURIComponent(projectName)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (Array.isArray(data?.names)) setSecretNames(data.names);
      })
      .catch(() => undefined);
  }, [projectName]);

  const saveSecret = async (name: string, value: string | null) => {
    setBusy(`secret:${name}`);
    setMessage('');
    try {
      const response = await fetch('/api/cloudflare/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, name, value }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 409) throw new Error(data.error || 'Unable to save secret');
      if (Array.isArray(data.names)) setSecretNames(data.names);
      else if (value === null) setSecretNames((current) => current.filter((entry) => entry !== name));
      else setSecretNames((current) => [...new Set([...current, name])].sort());
      setSecretName('');
      setSecretValue('');
      setMessage(data.error || 'Cloudflare secret saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save secret');
    } finally {
      setBusy(null);
    }
  };

  const addDomain = async () => {
    setBusy('domain');
    setMessage('');
    try {
      const response = await fetch('/api/cloudflare/domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, domain }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to add domain');
      setMessage('Custom domain added. DNS and certificate activation can take a few minutes.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add domain');
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (deploymentId: string) => {
    if (!window.confirm('Promote this deployment back to production?')) return;
    setBusy(`rollback:${deploymentId}`);
    setMessage('');
    try {
      const response = await fetch('/api/cloudflare/rollback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, deploymentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Rollback failed');
      setMessage('Production rolled back successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Rollback failed');
    } finally {
      setBusy(null);
    }
  };

  const cloudflareDeployments = deployments.filter(
    (deployment) => deployment.provider === 'cloudflare' && deployment.cloudflareDeploymentId
  );

  return (
    <section className="border border-[var(--border)] bg-[var(--background-surface)] p-6 space-y-5">
      <div className="flex items-center gap-2 text-[var(--secondary-text)]">
        <ShieldCheck className="w-4 h-4" />
        <h2 className="text-xs font-mono uppercase tracking-widest">Cloudflare</h2>
      </div>

      {!cloudflareProjectName ? (
        <div className="text-[11px] font-mono text-[var(--muted-text)]">
          Deploy this project to Cloudflare to configure domains, secrets, D1, and rollback.
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-2 gap-4 text-[11px] font-mono text-[var(--muted-text)]">
            <div><span className="text-[var(--secondary-text)] uppercase">Pages project</span><br />{cloudflareProjectName}</div>
            <div><span className="text-[var(--secondary-text)] uppercase">D1 database</span><br />{d1DatabaseName || 'Not provisioned'}</div>
          </div>

          <div className="grid gap-2 border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-[var(--secondary-text)]">
              <Globe2 className="w-3 h-3" /> Custom domain
            </div>
            <div className="flex gap-2">
              <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="www.example.com" className="text-xs font-mono" />
              <Button type="button" variant="outline" className="font-mono uppercase text-[10px]" disabled={!domain || busy === 'domain'} onClick={addDomain}>
                {busy === 'domain' ? 'Adding…' : customDomain ? 'Update' : 'Add'}
              </Button>
            </div>
          </div>

          <div className="grid gap-2 border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-[var(--secondary-text)]">
              <Database className="w-3 h-3" /> Worker secrets
            </div>
            <div className="text-[10px] font-mono text-[var(--muted-text)]">Values are write-only and are never returned to this page.</div>
            <div className="grid sm:grid-cols-[1fr_1.5fr_auto] gap-2">
              <Input value={secretName} onChange={(event) => setSecretName(event.target.value.toUpperCase())} placeholder="API_KEY" className="text-xs font-mono" />
              <Input type="password" value={secretValue} onChange={(event) => setSecretValue(event.target.value)} placeholder="Secret value" className="text-xs font-mono" autoComplete="off" />
              <Button type="button" variant="outline" className="font-mono uppercase text-[10px]" disabled={!secretName || !secretValue || busy !== null} onClick={() => saveSecret(secretName, secretValue)}>
                Save
              </Button>
            </div>
            {secretNames.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {secretNames.map((name) => (
                  <div key={name} className="inline-flex items-center gap-2 border border-[var(--border)] px-2 py-1 text-[10px] font-mono">
                    {name}
                    <button type="button" aria-label={`Remove ${name}`} disabled={busy !== null} onClick={() => saveSecret(name, null)} className="text-[var(--muted-text)] hover:text-red-500">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {cloudflareDeployments.length > 1 && (
            <div className="grid gap-2 border-t border-[var(--border)] pt-4">
              <div className="text-[10px] font-mono uppercase text-[var(--secondary-text)]">Rollback</div>
              {cloudflareDeployments.slice(1, 6).map((deployment) => (
                <div key={deployment._id} className="flex items-center justify-between gap-3 text-[10px] font-mono text-[var(--muted-text)]">
                  <span>{new Date(deployment.createdAt).toLocaleString()}</span>
                  <Button type="button" variant="ghost" className="font-mono uppercase text-[10px]" disabled={busy !== null} onClick={() => rollback(deployment.cloudflareDeploymentId!)}>
                    <RotateCcw className="w-3 h-3 mr-1" /> Roll back
                  </Button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {message && <div role="status" className="text-[10px] font-mono text-[var(--muted-text)]">{message}</div>}
    </section>
  );
}
