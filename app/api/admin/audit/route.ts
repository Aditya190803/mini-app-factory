import { NextResponse } from 'next/server';
import { stackServerApp } from '@/stack/server';
import { listAIAdminAudit } from '@/lib/ai-settings-store';
import { isAdminEmail } from '@/lib/admin-access';

export async function GET(req: Request) {
  try {
    const user = await stackServerApp.getUser();
    const email = user?.primaryEmail ?? null;

    if (!user?.id || !email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdminEmail(email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const rawLimit = Number(searchParams.get('limit') ?? '25');
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
      : 25;

    const entries = await listAIAdminAudit({
      userId: user.id,
      limit,
    });

    return NextResponse.json({ entries });
  } catch {
    return NextResponse.json({ error: 'Failed to load admin audit entries' }, { status: 500 });
  }
}
