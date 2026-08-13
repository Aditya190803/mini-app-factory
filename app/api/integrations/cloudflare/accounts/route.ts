import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { listCloudflareAccounts } from '@/lib/cloudflare';
import { getIntegrationTokens, upsertIntegrationTokens } from '@/lib/integrations';

const schema = z.object({ accountId: z.string().trim().min(1).max(64) }).strict();

async function authorizedAccounts() {
  const integration = await getIntegrationTokens();
  if (!integration?.cloudflareApiToken) throw new Error('Cloudflare is not connected');
  const accounts = await listCloudflareAccounts(integration.cloudflareApiToken);
  return { integration, accounts };
}

export async function GET() {
  if (!await stackServerApp.getUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { accounts } = await authorizedAccounts();
    return Response.json({ accounts });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to load Cloudflare accounts' }, { status: 400 });
  }
}

export async function POST(req: Request) {
  if (!await stackServerApp.getUser()) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid account' }, { status: 400 });

  try {
    const { integration, accounts } = await authorizedAccounts();
    const account = accounts.find((candidate) => candidate.id === parsed.data.accountId);
    if (!account) return Response.json({ error: 'That account was not authorized' }, { status: 403 });
    await upsertIntegrationTokens({
      cloudflareApiToken: integration.cloudflareApiToken,
      cloudflareRefreshToken: integration.cloudflareRefreshToken,
      cloudflareTokenExpiresAt: integration.cloudflareTokenExpiresAt,
      cloudflareOAuthScope: integration.cloudflareOAuthScope,
      cloudflareAccountId: account.id,
      cloudflareAccountName: account.name,
    });
    return Response.json({ account });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to change Cloudflare account' }, { status: 400 });
  }
}
