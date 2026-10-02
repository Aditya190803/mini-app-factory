import { z } from 'zod';
import { apiError } from '@/lib/api-route';
import { teardownCloudflareProduction } from '@/lib/cloudflare-preview';
import { getIntegrationTokens } from '@/lib/integrations';
import { requireProjectRole } from '@/lib/project-access';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120),
  /** Typed by the user, to make deleting a live site deliberate. */
  confirmName: z.string().trim().min(1).max(120),
}).strict();

/**
 * Take the Cloudflare deployment down: delete the Pages project and every resource this project
 * created (Workers, D1, KV, queues, R2, Vectorize). Owner-only, and the project name has to be
 * typed back. Data in D1, KV and R2 is deleted with them.
 */
export async function DELETE(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'Invalid request', 'INVALID_REQUEST');
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  if (parsed.data.confirmName !== access.project.name) {
    return apiError(400, 'Type the project name to confirm', 'INVALID_REQUEST');
  }
  if (!access.project.cloudflareProjectName && !access.project.cloudflareResourcesJson) {
    return apiError(400, 'This project has no Cloudflare deployment', 'INVALID_REQUEST');
  }
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) {
    return apiError(400, 'Cloudflare connection required', 'CLOUDFLARE_NOT_CONNECTED');
  }
  const failures = await teardownCloudflareProduction({
    token: integration.cloudflareApiToken,
    accountId: integration.cloudflareAccountId,
    project: access.project,
  });
  if (failures.length) return Response.json({ error: 'Some resources could not be deleted', failures }, { status: 409 });
  return Response.json({ ok: true });
}
