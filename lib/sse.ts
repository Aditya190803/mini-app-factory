/**
 * Shared SSE (Server-Sent Events) writer utility.
 * Used by generate and deploy routes to send streaming updates to clients.
 */
export function createSSEWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal?: AbortSignal
) {
  const encoder = new TextEncoder();
  let closed = false;

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
    if (closed) return;
    closed = true;
    try {
      controller.close();
    } catch {
      // Stream might already be closed, errored, or cancelled
    }
  };

  const markClosed = () => {
    closed = true;
  };

  const isClosed = () => closed || !!signal?.aborted;

  return { write, close, markClosed, isClosed };
}
