import { z } from 'zod';
import type { Id } from '@/convex/_generated/dataModel';
import { stackServerApp } from '@/stack/server';
import { cancelProjectRun } from '@/lib/project-runs';

const schema = z.object({
  projectName: z.string().trim().min(1).max(120),
  runId: z.string().min(1),
}).strict();

export async function POST(request: Request) {
  const user = await stackServerApp.getUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request' }, { status: 400 });
  try {
    await cancelProjectRun(parsed.data.projectName, parsed.data.runId as Id<'generationRuns'>);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Unable to cancel run' }, { status: 400 });
  }
}
