import { describe, expect, test } from 'vitest';
import { consumeTransformStream } from '@/lib/transform-stream';

describe('consumeTransformStream', () => {
  test('parses complete event from SSE body', async () => {
    const body =
      'data: {"status":"planning","message":"x"}\n\ndata: {"status":"complete","requestId":"r1","full":true,"files":[{"path":"index.html","content":"<p/>","language":"html","fileType":"page"}]}\n\n';
    const res = new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    const events: string[] = [];
    const complete = await consumeTransformStream(res, (e) => events.push(e.status));
    expect(complete.requestId).toBe('r1');
    expect(events).toEqual(['planning', 'complete']);
  });

  test('throws on error event', async () => {
    const body = 'data: {"status":"error","error":"nope","code":"X","requestId":"r2"}\n\n';
    const res = new Response(body, { status: 200 });
    await expect(consumeTransformStream(res)).rejects.toMatchObject({ message: 'nope', code: 'X' });
  });
});