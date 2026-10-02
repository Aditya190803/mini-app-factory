import type { ProjectFile } from '@/lib/page-builder';

export type TransformStreamEvent =
  | { status: 'planning'; message?: string; editType?: string }
  | { status: 'generating'; message?: string }
  | { status: 'applying'; index: number; total: number; tool: string; path?: string }
  | { status: 'saving'; message?: string }
  | {
      status: 'complete';
      requestId: string;
      full: boolean;
      files?: ProjectFile[];
      deletedPaths?: string[];
      html?: string;
      /**
       * The version the server saved. The client adopts it instead of saving the same files
       * again, which used to fail against the bumped version and raise a false conflict.
       */
      filesVersion?: number;
      /** Tokens the transform spent, for the run record. */
      usage?: { inputTokens: number; outputTokens: number; calls: number; model?: string };
      /**
       * Operations the model asked for that could not be applied, even after retries. The
       * transform still succeeded and the result still passed validation — these are reported so
       * a partially-applied edit is visible rather than silently dropped.
       */
      warnings?: string[];
    }
  | { status: 'error'; error: string; code: string; requestId: string };

export type TransformCompletePayload = Extract<TransformStreamEvent, { status: 'complete' }>;

const STREAM_IDLE_MS = 180_000;

/** Parse SSE body from POST /api/transform until complete or error. */
export async function consumeTransformStream(
  response: Response,
  onEvent?: (event: TransformStreamEvent) => void
): Promise<TransformCompletePayload> {
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw Object.assign(new Error(data.error || 'Transform failed'), { code: data.code, requestId: data.requestId });
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let lastError: TransformStreamEvent | null = null;
  let complete: TransformCompletePayload | null = null;
  let lastEventAt = Date.now();

  try {
    while (true) {
      const remaining = STREAM_IDLE_MS - (Date.now() - lastEventAt);
      if (remaining <= 0) {
        await reader.cancel().catch(() => undefined);
        throw Object.assign(new Error('Model stopped responding. Try again, or pick a faster model.'), {
          code: 'TIMEOUT',
        });
      }

      const readResult = await Promise.race([
        reader.read(),
        new Promise<'idle'>((resolve) => setTimeout(() => resolve('idle'), remaining)),
      ]);

      if (readResult === 'idle') {
        await reader.cancel().catch(() => undefined);
        throw Object.assign(new Error('Model stopped responding. Try again, or pick a faster model.'), {
          code: 'TIMEOUT',
        });
      }

      const { done, value } = readResult;
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const message of messages) {
        const line = message.trim();
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6)) as TransformStreamEvent;
          lastEventAt = Date.now();
          onEvent?.(data);
          if (data.status === 'error') lastError = data;
          if (data.status === 'complete') complete = data;
        } catch {
          /* ignore malformed */
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (complete) return complete;
  if (lastError?.status === 'error') {
    throw Object.assign(new Error(lastError.error), { code: lastError.code, requestId: lastError.requestId });
  }
  throw Object.assign(new Error('Transform was interrupted. Your prompt was restored — send again.'), {
    code: 'ABORTED',
  });
}