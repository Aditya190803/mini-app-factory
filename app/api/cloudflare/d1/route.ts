import { z } from 'zod';
import { upstreamErrorResponse, apiError } from '@/lib/api-route';
import { queryCloudflareD1 } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { requireProjectRole } from '@/lib/project-access';

const querySchema = z.object({ projectName: z.string().min(1).max(120), table: z.string().max(128).optional() });

export async function GET(req: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return apiError(400, 'Invalid request', 'INVALID_REQUEST');
  const access = await requireProjectRole(parsed.data.projectName, 'owner');
  if (!access.ok) return access.response;
  const { project } = access;
  if (!project?.cloudflareD1DatabaseId) return apiError(400, 'This project has no deployed D1 database', 'INVALID_REQUEST');
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return apiError(400, 'Cloudflare connection required', 'CLOUDFLARE_NOT_CONNECTED');

  try {
    const params = { token: integration.cloudflareApiToken, accountId: integration.cloudflareAccountId, databaseId: project.cloudflareD1DatabaseId };
    const tableResult = await queryCloudflareD1({ ...params, sql: "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name" });
    const tables = (tableResult[0]?.results || []).map((row) => String(row.name));
    if (!parsed.data.table) return Response.json({ tables });
    if (!tables.includes(parsed.data.table)) return Response.json({ error: 'Unknown table' }, { status: 404 });
    const escaped = parsed.data.table.replace(/"/g, '""');
    const [columns, rows] = await Promise.all([
      queryCloudflareD1({ ...params, sql: `PRAGMA table_info("${escaped}")` }),
      queryCloudflareD1({ ...params, sql: `SELECT * FROM "${escaped}" LIMIT 100` }),
    ]);
    return Response.json({ tables, table: parsed.data.table, columns: columns[0]?.results || [], rows: rows[0]?.results || [] });
  } catch (error) {
    return upstreamErrorResponse(error, 'Unable to inspect D1');
  }
}
