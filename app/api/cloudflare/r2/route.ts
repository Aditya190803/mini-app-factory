import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { cloudflareRequest } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { getProject } from '@/lib/projects';
import { assertCanAccessProject } from '@/lib/project-access';

const querySchema = z.object({ projectName: z.string().min(1).max(120), bucket: z.string().min(3).max(64), prefix: z.string().max(512).optional() });
const deleteSchema = querySchema.pick({ projectName: true, bucket: true }).extend({ key: z.string().min(1).max(1024) });

function projectBuckets(resourcesJson?: string) {
  try {
    const state = JSON.parse(resourcesJson || '{}') as { r2?: Record<string, { name?: string }> };
    return [...new Set(Object.values(state.r2 || {}).map((item) => item.name).filter((name): name is string => !!name))];
  } catch { return []; }
}

async function context(projectName: string, bucket: string) {
  const user = await stackServerApp.getUser();
  if (!user) return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  const project = await getProject(projectName);
  const access = assertCanAccessProject(project, user.id);
  if (!access.ok) return { error: Response.json({ error: access.message }, { status: access.status }) } as const;
  if (!projectBuckets(project?.cloudflareResourcesJson).includes(bucket)) return { error: Response.json({ error: 'Bucket is not bound to this project' }, { status: 403 }) } as const;
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return { error: Response.json({ error: 'Cloudflare connection required' }, { status: 400 }) } as const;
  return { token: integration.cloudflareApiToken, accountId: integration.cloudflareAccountId } as const;
}

export async function GET(req: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const ctx = await context(parsed.data.projectName, parsed.data.bucket); if ('error' in ctx) return ctx.error;
  try {
    const params = new URLSearchParams({ per_page: '200' });
    if (parsed.data.prefix) params.set('prefix', parsed.data.prefix);
    const objects = await cloudflareRequest<Array<{ key?: string; size?: number; etag?: string; last_modified?: string; http_metadata?: { contentType?: string } }>>(`/accounts/${encodeURIComponent(ctx.accountId)}/r2/buckets/${encodeURIComponent(parsed.data.bucket)}/objects?${params}`, ctx.token);
    return Response.json({ bucket: parsed.data.bucket, objects: objects.map((item) => ({ key: item.key, size: item.size, etag: item.etag, lastModified: item.last_modified, contentType: item.http_metadata?.contentType })) });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to list R2 objects' }, { status: 400 }); }
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return Response.json({ error: 'Invalid upload' }, { status: 400 });
  const parsed = querySchema.pick({ projectName: true, bucket: true }).extend({ key: z.string().min(1).max(1024) }).safeParse({ projectName: form.get('projectName'), bucket: form.get('bucket'), key: form.get('key') });
  const file = form.get('file');
  if (!parsed.success || !(file instanceof File)) return Response.json({ error: 'Invalid upload' }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: 'Uploads are limited to 10 MB' }, { status: 413 });
  const ctx = await context(parsed.data.projectName, parsed.data.bucket); if ('error' in ctx) return ctx.error;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(ctx.accountId)}/r2/buckets/${encodeURIComponent(parsed.data.bucket)}/objects/${parsed.data.key.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': file.type || 'application/octet-stream' }, body: await file.arrayBuffer() });
  const payload = await response.json().catch(() => null) as { success?: boolean; errors?: Array<{ message?: string }> } | null;
  if (!response.ok || !payload?.success) return Response.json({ error: payload?.errors?.map((item) => item.message).filter(Boolean).join('; ') || `Cloudflare upload failed (${response.status})` }, { status: 400 });
  return Response.json({ key: parsed.data.key, size: file.size });
}

export async function DELETE(req: Request) {
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const ctx = await context(parsed.data.projectName, parsed.data.bucket); if ('error' in ctx) return ctx.error;
  try {
    await cloudflareRequest(`/accounts/${encodeURIComponent(ctx.accountId)}/r2/buckets/${encodeURIComponent(parsed.data.bucket)}/objects/${parsed.data.key.split('/').map(encodeURIComponent).join('/')}`, ctx.token, { method: 'DELETE' });
    return Response.json({ deleted: parsed.data.key });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Unable to delete R2 object' }, { status: 400 }); }
}
