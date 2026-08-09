import { z } from 'zod';
import { stackServerApp } from '@/stack/server';
import { listCloudflareAccounts, verifyCloudflareToken } from '@/lib/cloudflare';
import { upsertIntegrationTokens } from '@/lib/integrations';

const schema = z.object({
  token: z.string().trim().min(20).max(2048),
  accountId: z.string().trim().min(1).max(64).optional(),
}).strict();

export async function POST(req: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid token or account' }, { status: 400 });

  try {
    const verification = await verifyCloudflareToken(parsed.data.token);
    if (verification.status !== 'active') {
      return Response.json({ error: 'Cloudflare token is not active' }, { status: 400 });
    }

    const accounts = await listCloudflareAccounts(parsed.data.token);
    if (accounts.length === 0) {
      return Response.json(
        { error: 'Token cannot access any accounts. Check its account scope and permissions.' },
        { status: 400 }
      );
    }

    if (!parsed.data.accountId && accounts.length > 1) {
      return Response.json({ requiresAccount: true, accounts });
    }

    const account = parsed.data.accountId
      ? accounts.find((candidate) => candidate.id === parsed.data.accountId)
      : accounts[0];
    if (!account) return Response.json({ error: 'Selected account is not available to this token' }, { status: 400 });

    await upsertIntegrationTokens({
      cloudflareApiToken: parsed.data.token,
      cloudflareTokenId: verification.id,
      cloudflareAccountId: account.id,
      cloudflareAccountName: account.name,
    });

    return Response.json({ connected: true, account: { id: account.id, name: account.name } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cloudflare connection failed';
    return Response.json({ error: message }, { status: 400 });
  }
}
