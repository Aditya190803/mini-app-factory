import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { TransformStreamEvent } from '@/lib/transform-stream';

/**
 * Covers the tool-failure repair loop in runTransformWork.
 *
 * The behaviour being locked in: a tool call that cannot be applied no longer discards the
 * operations that already succeeded. Failures are handed back to the model to correct, and
 * anything still unresolved is reported as a warning on an otherwise successful transform.
 * Previously the first failure threw, and because the project path rethrows, the user lost the
 * whole edit.
 */

vi.mock('server-only', () => ({}));
vi.mock('@/lib/projects', () => ({
  saveFiles: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/ai-client', () => ({
  getAIClient: vi.fn(),
}));

beforeAll(() => {
  process.env.NEXT_PUBLIC_CONVEX_URL = 'https://example.convex.cloud';
  process.env.INTEGRATION_TOKEN_SECRET = '12345678901234567890123456789012';
});

beforeEach(() => {
  vi.clearAllMocks();
});

const HOME = {
  path: 'index.html',
  content: '<html><body><h1>Original</h1></body></html>',
  language: 'html' as const,
  fileType: 'page' as const,
};

/** Queue up one model response per sendAndWait call. */
async function mockModel(responses: string[]) {
  const { getAIClient } = await import('@/lib/ai-client');
  const sent: string[] = [];
  let call = 0;

  const session = {
    sendAndWait: vi.fn(async ({ prompt }: { prompt: string }) => {
      sent.push(prompt);
      return { data: { content: responses[Math.min(call++, responses.length - 1)] } };
    }),
    destroy: vi.fn().mockResolvedValue(undefined),
  };

  (getAIClient as ReturnType<typeof vi.fn>).mockResolvedValue({
    createSession: vi.fn().mockResolvedValue(session),
  });

  return { session, sent };
}

async function run(responses: string[]) {
  const { runTransformWork } = await import('@/lib/transform-run');
  const { sent } = await mockModel(responses);
  const events: TransformStreamEvent[] = [];

  await runTransformWork({
    requestId: 'req_test',
    projectName: 'demo-project',
    prompt: 'Change the heading',
    finalFiles: [{ ...HOME }],
    runtimeConfig: { adminConfig: {}, byokConfig: {} } as never,
    onEvent: (event) => events.push(event),
  });

  const complete = events.find((e) => e.status === 'complete');
  return { events, complete, sent };
}

const OK_CALL = {
  tool: 'updateFile',
  args: { file: 'index.html', content: '<html><body><h1>Updated</h1></body></html>' },
};
/** Rejected by the executor with "Invalid file path" — deterministic, no cheerio involved. */
const BAD_CALL = { tool: 'updateFile', args: { file: '', content: 'nope' } };

describe('transform tool-failure repair', () => {
  test('keeps successful operations when a later call fails', async () => {
    const { complete } = await run([
      JSON.stringify([OK_CALL, BAD_CALL]),
      JSON.stringify([]), // model offers no correction, so the loop stops
    ]);

    const { saveFiles } = await import('@/lib/projects');
    expect(saveFiles).toHaveBeenCalledTimes(1);

    const savedFiles = (saveFiles as ReturnType<typeof vi.fn>).mock.calls[0][1] as Array<{
      path: string;
      content: string;
    }>;
    // The successful updateFile survived rather than being discarded with the failure.
    expect(savedFiles.find((f) => f.path === 'index.html')?.content).toContain('Updated');

    expect(complete?.status).toBe('complete');
  });

  test('reports unresolved failures as warnings, not an error', async () => {
    const { complete } = await run([
      JSON.stringify([OK_CALL, BAD_CALL]),
      JSON.stringify([]),
    ]);

    expect(complete?.status === 'complete' && complete.warnings).toBeDefined();
    const warnings = complete?.status === 'complete' ? complete.warnings ?? [] : [];
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Could not apply updateFile/);
  });

  test('feeds the failure back to the model, including the error text', async () => {
    const { sent } = await run([
      JSON.stringify([BAD_CALL]),
      JSON.stringify([OK_CALL]),
    ]);

    // First prompt is the edit request; the second is the repair turn.
    expect(sent.length).toBeGreaterThanOrEqual(2);
    expect(sent[1]).toContain('could not be applied');
    expect(sent[1]).toContain('Invalid file path');
  });

  test('a successful repair round leaves no warnings', async () => {
    const { complete } = await run([
      JSON.stringify([BAD_CALL]),
      JSON.stringify([OK_CALL]),
    ]);

    const warnings = complete?.status === 'complete' ? complete.warnings : undefined;
    expect(warnings).toBeUndefined();

    const { saveFiles } = await import('@/lib/projects');
    const savedFiles = (saveFiles as ReturnType<typeof vi.fn>).mock.calls[0][1] as Array<{
      path: string;
      content: string;
    }>;
    expect(savedFiles.find((f) => f.path === 'index.html')?.content).toContain('Updated');
  });

  test('stops after the repair-round cap instead of looping', async () => {
    // The model never corrects itself: every response repeats the failing call.
    const { sent, complete } = await run([JSON.stringify([BAD_CALL])]);

    // 1 initial + at most MAX_TOOL_REPAIR_ROUNDS (2) repair turns.
    expect(sent.length).toBeLessThanOrEqual(3);
    expect(complete?.status).toBe('complete');
  });

  test('no warnings on a clean transform', async () => {
    const { complete } = await run([JSON.stringify([OK_CALL])]);
    const warnings = complete?.status === 'complete' ? complete.warnings : undefined;
    expect(warnings).toBeUndefined();
  });
});
