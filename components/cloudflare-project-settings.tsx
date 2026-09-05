'use client';

import { useEffect, useMemo, useState } from 'react';
import { Boxes, Database, Globe2, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirm } from '@/hooks/use-confirm';

type Deployment = {
  _id: string;
  provider: string;
  createdAt: number;
  deploymentUrl?: string;
  cloudflareDeploymentId?: string;
};
type Zone = { id: string; name: string };
type D1Data = { tables: string[]; table?: string; columns?: Array<{ name?: string }>; rows?: Array<Record<string, unknown>> };
type R2Object = { key?: string; size?: number; lastModified?: string; contentType?: string };

type Props = {
  projectName: string;
  cloudflareProjectName?: string;
  d1DatabaseName?: string;
  resourcesJson?: string;
  customDomain?: string;
  deployments: Deployment[];
};

export default function CloudflareProjectSettings({
  projectName,
  cloudflareProjectName,
  d1DatabaseName,
  resourcesJson,
  customDomain,
  deployments,
}: Props) {
  const { confirm, confirmDialog } = useConfirm();
  const [secretNames, setSecretNames] = useState<string[]>([]);
  const [secretName, setSecretName] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [domain, setDomain] = useState(customDomain ?? '');
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState('');
  const [subdomain, setSubdomain] = useState('www');
  const [domainStatus, setDomainStatus] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [d1, setD1] = useState<D1Data | null>(null);
  const [d1Error, setD1Error] = useState('');
  const [r2Bucket, setR2Bucket] = useState('');
  const [r2Objects, setR2Objects] = useState<R2Object[]>([]);
  const [r2Prefix, setR2Prefix] = useState('');
  const resources = useMemo(() => {
    try {
      const state = JSON.parse(resourcesJson || '{}') as Record<string, Record<string, { name?: string }>>;
      return Object.entries(state).flatMap(([kind, entries]) =>
        kind === 'version' || !entries || typeof entries !== 'object'
          ? []
          : Object.entries(entries).map(([binding, resource]) => ({ kind, binding, name: resource.name || 'bound' }))
      );
    } catch {
      return [];
    }
  }, [resourcesJson]);
  const r2Buckets = useMemo(() => resources.filter((resource) => resource.kind === 'r2').map((resource) => resource.name), [resources]);

  useEffect(() => { if (!r2Bucket && r2Buckets[0]) setR2Bucket(r2Buckets[0]); }, [r2Bucket, r2Buckets]);

  const loadR2 = async (bucket = r2Bucket) => {
    if (!bucket) return;
    setBusy('r2'); setMessage('');
    try {
      const response = await fetch(`/api/cloudflare/r2?projectName=${encodeURIComponent(projectName)}&bucket=${encodeURIComponent(bucket)}&prefix=${encodeURIComponent(r2Prefix)}`);
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to list objects');
      setR2Objects(data.objects || []);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to list objects'); }
    finally { setBusy(null); }
  };

  const uploadR2 = async (file: File | undefined) => {
    if (!file || !r2Bucket) return;
    const key = `${r2Prefix.replace(/^\/+|\/+$/g, '')}${r2Prefix ? '/' : ''}${file.name}`;
    const form = new FormData(); form.set('projectName', projectName); form.set('bucket', r2Bucket); form.set('key', key); form.set('file', file);
    setBusy('r2'); setMessage('');
    try { const response = await fetch('/api/cloudflare/r2', { method: 'POST', body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Upload failed'); setMessage(`Uploaded ${key}.`); await loadR2(); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Upload failed'); }
    finally { setBusy(null); }
  };

  const deleteR2 = async (key: string) => {
    if (!(await confirm({
      title: `Delete ${key}?`,
      description: 'This permanently removes the object from the R2 bucket.',
      confirmLabel: 'Delete object',
      destructive: true,
    }))) return;
    setBusy('r2');
    try { const response = await fetch('/api/cloudflare/r2', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName, bucket: r2Bucket, key }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Delete failed'); setR2Objects((items) => items.filter((item) => item.key !== key)); setMessage(`Deleted ${key}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Delete failed'); }
    finally { setBusy(null); }
  };

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

  useEffect(() => {
    if (!cloudflareProjectName) return;
    fetch(`/api/cloudflare/domain?projectName=${encodeURIComponent(projectName)}`)
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!data) return;
        const nextZones = Array.isArray(data.zones) ? data.zones : [];
        setZones(nextZones);
        setSelectedZone(nextZones[0]?.name || '');
        setDomainStatus(data.domain?.status || data.domain?.verification_data?.status || '');
      })
      .catch(() => undefined);
  }, [cloudflareProjectName, projectName]);

  useEffect(() => {
    if (!d1DatabaseName) return;
    fetch(`/api/cloudflare/d1?projectName=${encodeURIComponent(projectName)}`)
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error); return data; })
      .then(setD1)
      .catch((error) => setD1Error(error instanceof Error ? error.message : 'Unable to inspect D1'));
  }, [d1DatabaseName, projectName]);

  const inspectTable = async (table: string) => {
    setBusy('d1');
    setD1Error('');
    try {
      const response = await fetch(`/api/cloudflare/d1?projectName=${encodeURIComponent(projectName)}&table=${encodeURIComponent(table)}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to inspect table');
      setD1(data);
    } catch (error) {
      setD1Error(error instanceof Error ? error.message : 'Unable to inspect table');
    } finally { setBusy(null); }
  };

  useEffect(() => {
    if (!customDomain && selectedZone) setDomain(subdomain.trim() ? `${subdomain.trim().toLowerCase()}.${selectedZone}` : selectedZone);
  }, [customDomain, selectedZone, subdomain]);

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
      setDomainStatus(data.domain?.status || 'pending');
      setMessage('Domain attached. Cloudflare is configuring DNS and TLS.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to add domain');
    } finally {
      setBusy(null);
    }
  };

  const removeDomain = async () => {
    if (!(await confirm({
      title: `Remove ${domain}?`,
      description: 'The custom domain is detached from this Pages project. DNS records are not changed.',
      confirmLabel: 'Remove domain',
      destructive: true,
    }))) return;
    setBusy('domain');
    setMessage('');
    try {
      const response = await fetch('/api/cloudflare/domain', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectName }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to remove domain');
      setDomain('');
      setDomainStatus('');
      setMessage('Custom domain removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to remove domain');
    } finally {
      setBusy(null);
    }
  };

  const rollback = async (deploymentId: string) => {
    if (!(await confirm({
      title: 'Promote this deployment?',
      description: 'This deployment becomes the live production version.',
      confirmLabel: 'Promote',
    }))) return;
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
    <section className="space-y-5 rounded-xl border border-border bg-card p-6">
      {confirmDialog}
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

          {resources.length > 0 && (
            <div className="grid gap-2 border-t border-[var(--border)] pt-4">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-[var(--secondary-text)]">
                <Boxes className="w-3 h-3" /> Resource bindings
              </div>
              <div className="grid sm:grid-cols-2 gap-2">
                {resources.map((resource) => (
                  <div key={`${resource.kind}:${resource.binding}`} className="border border-[var(--border)] px-2 py-1 text-[10px] font-mono text-[var(--muted-text)]">
                    <span className="text-[var(--secondary-text)]">{resource.binding}</span> · {resource.kind.toUpperCase()} · {resource.name}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-2 border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-[var(--secondary-text)]">
              <Globe2 className="w-3 h-3" /> Custom domain
            </div>
            {customDomain || domainStatus ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] px-3 py-2">
                <div className="min-w-0"><div className="truncate text-xs text-[var(--foreground)]">{domain}</div><div className="mt-0.5 text-[10px] capitalize text-[var(--muted-text)]">{domainStatus || 'Checking activation'}</div></div>
                <Button type="button" variant="ghost" className="text-[10px] text-red-400" disabled={busy === 'domain'} onClick={() => void removeDomain()}>Remove</Button>
              </div>
            ) : zones.length ? (
              <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input value={subdomain} onChange={(event) => setSubdomain(event.target.value.replace(/[^a-zA-Z0-9-]/g, ''))} placeholder="www (blank for apex)" className="text-xs font-mono" />
                <select value={selectedZone} onChange={(event) => setSelectedZone(event.target.value)} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs text-[var(--foreground)]">{zones.map((zone) => <option key={zone.id} value={zone.name}>{zone.name}</option>)}</select>
                <Button type="button" variant="outline" className="font-mono uppercase text-[10px]" disabled={!domain || busy === 'domain'} onClick={addDomain}>{busy === 'domain' ? 'Adding…' : 'Add'}</Button>
                <p className="text-[10px] leading-4 text-[var(--muted-text)] sm:col-span-3">Leave the subdomain blank to use the zone apex. Cloudflare will configure DNS and issue TLS automatically.</p>
              </div>
            ) : <p className="text-[10px] leading-4 text-[var(--muted-text)]">No active Cloudflare-managed zones were found. Reauthorize Cloudflare with Pages Write and Zone Read access.</p>}
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

          {d1DatabaseName ? <div className="grid gap-3 border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-[var(--secondary-text)]"><Database className="size-3" /> D1 data explorer</div>
            {d1?.tables.length ? <div className="flex flex-wrap gap-2">{d1.tables.map((table) => <button key={table} type="button" onClick={() => void inspectTable(table)} className={`rounded-md border px-2.5 py-1.5 text-xs ${d1.table === table ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-[var(--border)] text-[var(--secondary-text)]'}`}>{table}</button>)}</div> : <p className="text-xs text-[var(--muted-text)]">No application tables found.</p>}
            {d1?.table && d1.rows ? <div className="overflow-x-auto rounded-md border border-[var(--border)]"><table className="w-full min-w-max text-left text-xs"><thead className="bg-[var(--background)] text-[var(--muted-text)]"><tr>{(d1.columns || []).map((column) => <th key={column.name} className="px-3 py-2 font-medium">{column.name}</th>)}</tr></thead><tbody>{d1.rows.map((row, index) => <tr key={index} className="border-t border-[var(--border)]">{(d1.columns || []).map((column) => <td key={column.name} className="max-w-64 truncate px-3 py-2 font-mono text-[var(--secondary-text)]">{JSON.stringify(row[String(column.name)])}</td>)}</tr>)}</tbody></table>{d1.rows.length === 100 ? <p className="border-t border-[var(--border)] px-3 py-2 text-[10px] text-[var(--muted-text)]">Showing the first 100 rows.</p> : null}</div> : null}
            {d1Error ? <p role="alert" className="text-xs text-red-400">{d1Error}</p> : null}
          </div> : null}

          {r2Buckets.length ? <div className="grid gap-3 border-t border-[var(--border)] pt-4">
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase text-[var(--secondary-text)]"><Boxes className="size-3" /> R2 object manager</div>
            <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto_auto]"><select value={r2Bucket} onChange={(event) => { setR2Bucket(event.target.value); setR2Objects([]); }} className="rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs">{r2Buckets.map((bucket) => <option key={bucket}>{bucket}</option>)}</select><Input value={r2Prefix} onChange={(event) => setR2Prefix(event.target.value.replace(/\.\./g, ''))} placeholder="Optional prefix, e.g. uploads" className="font-mono text-xs" /><Button variant="outline" disabled={busy === 'r2'} onClick={() => void loadR2()}>Browse</Button><label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] px-3 text-xs"><Upload className="mr-2 size-3.5" /> Upload<input type="file" className="sr-only" onChange={(event) => { void uploadR2(event.target.files?.[0]); event.target.value = ''; }} /></label></div>
            {r2Objects.length ? <div className="max-h-72 overflow-y-auto rounded-md border border-[var(--border)]">{r2Objects.map((object) => <div key={object.key} className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-xs last:border-0"><code className="min-w-0 flex-1 truncate">{object.key}</code><span className="text-[10px] text-[var(--muted-text)]">{typeof object.size === 'number' ? `${(object.size / 1024).toFixed(1)} KB` : '—'}</span>{object.key ? <button type="button" onClick={() => void deleteR2(object.key!)} aria-label={`Delete ${object.key}`}><Trash2 className="size-3.5 text-red-400" /></button> : null}</div>)}</div> : <p className="text-xs text-[var(--muted-text)]">Browse a project-bound bucket to inspect up to 200 objects.</p>}
          </div> : null}

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
