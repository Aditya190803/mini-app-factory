import { z } from 'zod';
import { upstreamErrorResponse, apiError } from '@/lib/api-route';
import { CloudflareApiError, cloudflareRequest } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { requireProjectRole } from '@/lib/project-access';

const querySchema = z.object({ projectName: z.string().min(1).max(120), bucket: z.string().min(3).max(64), prefix: z.string().max(512).optional() });
const deleteSchema = querySchema.pick({ projectName: true, bucket: true }).extend({ key: z.string().min(1).max(1024) });

function projectBuckets(resourcesJson?: string) {
  try {
    const state = JSON.parse(resourcesJson || '{}') as { r2?: Record<string, { name?: string }> };
    return [...new Set(Object.values(state.r2 || {}).map((item) => item.name).filter((name): name is string => !!name))];
  } catch { return []; }
}

async function context(projectName: string, bucket: string) {
  const access = await requireProjectRole(projectName, 'owner');
  if (!access.ok) return { ok: false, error: access.response } as const;
  if (!projectBuckets(access.project.cloudflareResourcesJson).includes(bucket)) return { ok: false, error: apiError(403, 'Bucket is not bound to this project', 'FORBIDDEN') } as const;
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return { ok: false, error: apiError(400, 'Cloudflare connection required', 'CLOUDFLARE_NOT_CONNECTED') } as const;
  return { ok: true, token: integration.cloudflareApiToken, accountId: integration.cloudflareAccountId } as const;
}

export async function GET(req: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return apiError(400, 'Invalid request', 'INVALID_REQUEST');
  const ctx = await context(parsed.data.projectName, parsed.data.bucket); if (!ctx.ok) return ctx.error;
  try {
    const params = new URLSearchParams({ per_page: '200' });
    if (parsed.data.prefix) params.set('prefix', parsed.data.prefix);
    const objects = await cloudflareRequest<Array<{ key?: string; size?: number; etag?: string; last_modified?: string; http_metadata?: { contentType?: string } }>>(`/accounts/${encodeURIComponent(ctx.accountId)}/r2/buckets/${encodeURIComponent(parsed.data.bucket)}/objects?${params}`, ctx.token);
    return Response.json({ bucket: parsed.data.bucket, objects: objects.map((item) => ({ key: item.key, size: item.size, etag: item.etag, lastModified: item.last_modified, contentType: item.http_metadata?.contentType })) });
  } catch (error) { return upstreamErrorResponse(error, 'Unable to list R2 objects'); }
}

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return apiError(400, 'Invalid upload', 'INVALID_REQUEST');
  const parsed = querySchema.pick({ projectName: true, bucket: true }).extend({ key: z.string().min(1).max(1024) }).safeParse({ projectName: form.get('projectName'), bucket: form.get('bucket'), key: form.get('key') });
  const file = form.get('file');
  if (!parsed.success || !(file instanceof File)) return apiError(400, 'Invalid upload', 'INVALID_REQUEST');
  if (file.size > 10 * 1024 * 1024) return Response.json({ error: 'Uploads are limited to 10 MB' }, { status: 413 });
  const ctx = await context(parsed.data.projectName, parsed.data.bucket); if (!ctx.ok) return ctx.error;
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(ctx.accountId)}/r2/buckets/${encodeURIComponent(parsed.data.bucket)}/objects/${parsed.data.key.split('/').map(encodeURIComponent).join('/')}`, { method: 'PUT', headers: { Authorization: `Bearer ${ctx.token}`, 'Content-Type': file.type || 'application/octet-stream' }, body: await file.arrayBuffer() });
  const payload = await response.json().catch(() => null) as { success?: boolean; errors?: Array<{ message?: string }> } | null;
  if (!response.ok || !payload?.success) {
    const message = payload?.errors?.map((item) => item.message).filter(Boolean).join('; ') || `Cloudflare upload failed (${response.status})`;
    return upstreamErrorResponse(new CloudflareApiError(message, response.ok ? 400 : response.status), 'Cloudflare upload failed');
  }
  return Response.json({ key: parsed.data.key, size: file.size });
}

export async function DELETE(req: Request) {
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'Invalid request', 'INVALID_REQUEST');
  const ctx = await context(parsed.data.projectName, parsed.data.bucket); if (!ctx.ok) return ctx.error;
  try {
    await cloudflareRequest(`/accounts/${encodeURIComponent(ctx.accountId)}/r2/buckets/${encodeURIComponent(parsed.data.bucket)}/objects/${parsed.data.key.split('/').map(encodeURIComponent).join('/')}`, ctx.token, { method: 'DELETE' });
    return Response.json({ deleted: parsed.data.key });
  } catch (error) { return upstreamErrorResponse(error, 'Unable to delete R2 object'); }
}
