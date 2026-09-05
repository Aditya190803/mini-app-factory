'use client';

import { useEffect, useMemo, useState } from 'react';
import { Cloud, RotateCcw, Trash2, Upload } from 'lucide-react';
import {
  Badge,
  Button,
  Callout,
  CopyValue,
  EmptyState,
  Field,
  IconButton,
  Input,
  Row,
  RowList,
  Section,
  Select,
  SpecTable,
  StatusDot,
} from '@/components/kit';
import { cn } from '@/lib/utils';
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
    <div className="space-y-8">
      {confirmDialog}

      {!cloudflareProjectName ? (
        <Section
          title="Cloudflare"
          description="Domains, secrets, data, and rollback appear here once this project has been deployed to Cloudflare at least once."
        >
          <EmptyState title="Not deployed to Cloudflare yet" icon={<Cloud className="size-5" />}>
            <p>
              Open the editor and press Deploy. You will see the exact list of resources before any
              of them are created.
            </p>
          </EmptyState>
        </Section>
      ) : (
        <>
          <Section
            title="Cloudflare"
            description="This project lives in your own Cloudflare account. Everything below acts on it directly."
          >
            <SpecTable
              caption="Cloudflare project"
              rows={[
                {
                  key: 'pages',
                  label: 'Pages project',
                  value: <CopyValue value={cloudflareProjectName} label="the Pages project name" />,
                },
                {
                  key: 'd1',
                  label: 'D1 database',
                  value: d1DatabaseName || 'Not provisioned',
                  mono: Boolean(d1DatabaseName),
                  muted: !d1DatabaseName,
                },
                {
                  key: 'bindings',
                  label: 'Bindings',
                  value:
                    resources.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {resources.map((resource) => (
                          <Badge key={`${resource.kind}:${resource.binding}`} tone="neutral" mono>
                            {resource.binding} · {resource.kind} · {resource.name}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      'None bound'
                    ),
                  muted: resources.length === 0,
                },
              ]}
            />
          </Section>

          <Section
            title="Custom domain"
            description="Cloudflare configures DNS and issues the certificate. Removing a domain here detaches it from the Pages project and leaves your DNS records alone."
          >
            {customDomain || domainStatus ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--rule)] bg-[var(--surface-1)] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm">{domain}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                    <StatusDot tone={domainStatus === 'active' ? 'live' : 'pending'} />
                    {domainStatus || 'Checking activation'}
                  </p>
                </div>
                <Button
                  intent="danger"
                  size="sm"
                  busy={busy === 'domain'}
                  onClick={() => void removeDomain()}
                >
                  Remove
                </Button>
              </div>
            ) : zones.length ? (
              <div className="flex flex-wrap items-end gap-2">
                <Field
                  label="Subdomain"
                  optional
                  hint="Leave it empty to use the zone apex."
                  className="w-40"
                >
                  <Input
                    value={subdomain}
                    onChange={(event) =>
                      setSubdomain(event.target.value.replace(/[^a-zA-Z0-9-]/g, ''))
                    }
                    placeholder="www"
                    className="font-mono"
                  />
                </Field>
                <Field label="Zone" className="w-56">
                  <Select
                    value={selectedZone}
                    onChange={(event) => setSelectedZone(event.target.value)}
                  >
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.name}>
                        {zone.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button
                  intent="primary"
                  disabled={!domain}
                  busy={busy === 'domain'}
                  onClick={addDomain}
                >
                  Attach {domain || 'domain'}
                </Button>
              </div>
            ) : (
              <Callout tone="warning" title="No managed zones found">
                Reauthorize Cloudflare with Pages Write and Zone Read access, then reload this page.
              </Callout>
            )}
          </Section>

          <Section
            title="Worker secrets"
            description="Values are write only. They are sent to Cloudflare and never read back to this page, which is why an existing secret can be replaced but not viewed."
          >
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Name" className="w-48">
                <Input
                  value={secretName}
                  onChange={(event) => setSecretName(event.target.value.toUpperCase())}
                  placeholder="API_KEY"
                  className="font-mono"
                />
              </Field>
              <Field label="Value" className="w-64">
                <Input
                  type="password"
                  value={secretValue}
                  onChange={(event) => setSecretValue(event.target.value)}
                  placeholder="Never shown again"
                  autoComplete="off"
                  className="font-mono"
                />
              </Field>
              <Button
                intent="primary"
                disabled={!secretName || !secretValue}
                busy={busy === `secret:${secretName}`}
                onClick={() => saveSecret(secretName, secretValue)}
              >
                Save
              </Button>
            </div>

            {secretNames.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {secretNames.map((name) => (
                  <li
                    key={name}
                    className="inline-flex items-center gap-1.5 rounded-md border border-[var(--rule)] bg-[var(--surface-1)] py-0.5 pl-2 pr-0.5 font-mono text-xs"
                  >
                    {name}
                    <IconButton
                      label={`Delete the secret ${name}`}
                      size="sm"
                      intent="danger"
                      disabled={busy !== null}
                      onClick={() => saveSecret(name, null)}
                    >
                      <Trash2 className="size-3" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {d1DatabaseName && (
            <Section
              title="D1 data"
              description="Read only. The first hundred rows of whichever table you pick."
            >
              {d1?.tables.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {d1.tables.map((table) => (
                    <button
                      key={table}
                      type="button"
                      onClick={() => void inspectTable(table)}
                      aria-pressed={d1.table === table}
                      className={cn(
                        'rounded-md border px-2.5 py-1 font-mono text-xs transition-colors',
                        d1.table === table
                          ? 'border-[color-mix(in_oklab,var(--primary)_50%,transparent)] bg-[var(--signal-wash)] text-[var(--foreground)]'
                          : 'border-[var(--rule)] text-[var(--muted-foreground)] hover:border-[var(--rule-strong)] hover:text-[var(--foreground)]'
                      )}
                    >
                      {table}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  No application tables yet. Migrations create them on the next deploy.
                </p>
              )}

              {d1?.table && d1.rows && (
                <div className="scroll-thin mt-4 overflow-x-auto rounded-lg border border-[var(--rule)]">
                  <table className="w-full min-w-max text-left text-xs">
                    <caption className="sr-only">Rows in {d1.table}</caption>
                    <thead className="bg-[var(--surface-2)]">
                      <tr>
                        {(d1.columns || []).map((column) => (
                          <th
                            key={column.name}
                            scope="col"
                            className="whitespace-nowrap px-3 py-2 font-medium text-[var(--muted-foreground)]"
                          >
                            {column.name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {d1.rows.map((row, index) => (
                        <tr key={index} className="border-t border-[var(--rule)]">
                          {(d1.columns || []).map((column) => (
                            <td
                              key={column.name}
                              className="max-w-64 truncate px-3 py-1.5 font-mono text-[var(--foreground)]"
                            >
                              {JSON.stringify(row[String(column.name)])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {d1.rows.length === 100 && (
                    <p className="border-t border-[var(--rule)] px-3 py-1.5 text-xs text-[var(--muted-foreground)]">
                      Showing the first 100 rows.
                    </p>
                  )}
                </div>
              )}

              {d1Error && (
                <Callout tone="failed" className="mt-4">
                  {d1Error}
                </Callout>
              )}
            </Section>
          )}

          {r2Buckets.length > 0 && (
            <Section
              title="R2 objects"
              description="Browse, upload, and delete files in a bucket bound to this project. Deletes are permanent."
            >
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Bucket" className="w-48">
                  <Select
                    value={r2Bucket}
                    onChange={(event) => {
                      setR2Bucket(event.target.value)
                      setR2Objects([])
                    }}
                  >
                    {r2Buckets.map((bucket) => (
                      <option key={bucket}>{bucket}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prefix" optional className="w-56">
                  <Input
                    value={r2Prefix}
                    onChange={(event) => setR2Prefix(event.target.value.replace(/\.\./g, ''))}
                    placeholder="uploads"
                    className="font-mono"
                  />
                </Field>
                <Button busy={busy === 'r2'} onClick={() => void loadR2()}>
                  Browse
                </Button>
                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--rule-strong)] bg-[var(--surface-1)] px-3 text-sm font-medium transition-colors hover:bg-[var(--surface-2)] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--ring)]">
                  <Upload className="size-3.5" />
                  Upload
                  <input
                    type="file"
                    className="sr-only"
                    onChange={(event) => {
                      void uploadR2(event.target.files?.[0])
                      event.target.value = ''
                    }}
                  />
                </label>
              </div>

              {r2Objects.length > 0 ? (
                <div className="scroll-thin mt-4 max-h-80 overflow-y-auto">
                  <RowList>
                    {r2Objects.map((object) => (
                      <Row key={object.key}>
                        <code className="min-w-0 flex-1 truncate font-mono text-xs">
                          {object.key}
                        </code>
                        <span className="tabular shrink-0 text-xs text-[var(--muted-foreground)]">
                          {typeof object.size === 'number'
                            ? `${(object.size / 1024).toFixed(1)} KB`
                            : ''}
                        </span>
                        {object.key && (
                          <IconButton
                            label={`Delete ${object.key}`}
                            size="sm"
                            intent="danger"
                            onClick={() => void deleteR2(object.key!)}
                          >
                            <Trash2 className="size-3.5" />
                          </IconButton>
                        )}
                      </Row>
                    ))}
                  </RowList>
                </div>
              ) : (
                <p className="mt-4 text-sm text-[var(--muted-foreground)]">
                  Browse a bucket to list up to 200 objects.
                </p>
              )}
            </Section>
          )}

          {cloudflareDeployments.length > 1 && (
            <Section
              title="Rollback"
              description="Promote an earlier deployment back to production. The assets are already uploaded, so this is immediate."
            >
              <RowList>
                {cloudflareDeployments.slice(1, 6).map((deployment) => (
                  <Row key={deployment._id}>
                    <div className="min-w-0 flex-1">
                      <p className="tabular text-sm">
                        <time dateTime={new Date(deployment.createdAt).toISOString()}>
                          {new Date(deployment.createdAt).toLocaleString()}
                        </time>
                      </p>
                      {deployment.deploymentUrl && (
                        <p className="truncate font-mono text-xs text-[var(--muted-foreground)]">
                          {deployment.deploymentUrl}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => rollback(deployment.cloudflareDeploymentId!)}
                    >
                      <RotateCcw className="size-3.5" />
                      Promote
                    </Button>
                  </Row>
                ))}
              </RowList>
            </Section>
          )}
        </>
      )}

      {message && (
        <p role="status" className="text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      )}
    </div>
  )
}
