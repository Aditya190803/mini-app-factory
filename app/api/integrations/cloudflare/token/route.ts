import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { listCloudflareAccounts } from '@/lib/cloudflare';
import { upsertIntegrationTokens } from '@/lib/integrations';

const schema = z.object({
  token: z.string().trim().min(20).max(200),
}).strict();

export async function POST(request: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'Paste a Cloudflare API token' }, { status: 400 });
  }

  try {
    const accounts = await listCloudflareAccounts(parsed.data.token);
    if (!accounts.length) {
      return Response.json({ error: 'That token has no Cloudflare accounts' }, { status: 400 });
    }
    const account = accounts[0];
    await upsertIntegrationTokens({
      cloudflareApiToken: parsed.data.token,
      cloudflareAccountId: account.id,
      cloudflareAccountName: account.name,
    });
    return Response.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudflare rejected that token';
    return Response.json({ error: message }, { status: 400 });
  }
}
