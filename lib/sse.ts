/**
 * Shared SSE (Server-Sent Events) writer utility.
 * Used by generate and deploy routes to send streaming updates to clients.
 */
export function createSSEWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal?: AbortSignal,
  options?: { heartbeatMs?: number },
) {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;

  const write = (data: object): boolean => {
    if (closed || signal?.aborted) {
      if (!closed) closed = true;
      return false;
    }

    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      return true;
    } catch {
      closed = true;
      return false;
    }
  };

  const close = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // Stream might already be closed, errored, or cancelled
    }
  };

  const markClosed = () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    closed = true;
  };

  const isClosed = () => closed || !!signal?.aborted;

  // Start heartbeat if requested
  if (options?.heartbeatMs && options.heartbeatMs > 0) {
    heartbeatTimer = setInterval(() => {
      if (isClosed()) {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        return;
      }
      try {
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      } catch {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        closed = true;
      }
    }, options.heartbeatMs);
  }

  return { write, close, markClosed, isClosed };
}
