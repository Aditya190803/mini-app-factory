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
    }
  | { status: 'error'; error: string; code: string; requestId: string };

export type TransformCompletePayload = Extract<TransformStreamEvent, { status: 'complete' }>;

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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || '';

      for (const message of messages) {
        const line = message.trim();
        if (!line.startsWith('data: ')) continue;
        try {
          const data = JSON.parse(line.slice(6)) as TransformStreamEvent;
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
  throw new Error('Transform stream ended without result');
}