import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { queryCloudflareD1 } from '@/lib/cloudflare';
import { getIntegrationTokens } from '@/lib/integrations';
import { getProject } from '@/lib/projects';

const querySchema = z.object({ projectName: z.string().min(1).max(120), table: z.string().max(128).optional() });

export async function GET(req: Request) {
  if (!await stackServerApp.getUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  const project = await getProject(parsed.data.projectName);
  if (!project?.cloudflareD1DatabaseId) return Response.json({ error: 'This project has no deployed D1 database' }, { status: 400 });
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken || !integration.cloudflareAccountId) return Response.json({ error: 'Cloudflare connection required' }, { status: 400 });

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
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to inspect D1' }, { status: 400 });
  }
}
