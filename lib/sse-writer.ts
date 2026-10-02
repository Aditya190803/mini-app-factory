import 'server-only';

/** Thread-safe SSE writer for ReadableStream controllers. */
export function createSSEWriter(
  controller: ReadableStreamDefaultController<Uint8Array>,
  signal?: AbortSignal
) {
  const encoder = new TextEncoder();
  let closed = false;

  const closeController = () => {
    try {
      controller.close();
    } catch {
      /* stream already closed */
    }
  };

  const close = () => {
    if (closed) {
      // Previously we could mark closed on abort without closing the controller,
      // which left the client hung on reader.read(). Always try to close.
      closeController();
      return;
    }
    closed = true;
    closeController();
  };

  const write = (data: object): boolean => {
    if (closed) return false;
    try {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      return true;
    } catch {
      closed = true;
      closeController();
      return false;
    }
  };

  const markClosed = () => {
    closed = true;
  };

  // If the request is aborted mid-flight (Stop, navigation, HMR), unblock the
  // client instead of leaving the SSE body open forever.
  signal?.addEventListener(
    'abort',
    () => {
      try {
        if (!closed) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                status: 'error',
                error: 'Transform cancelled',
                code: 'ABORTED',
                requestId: '',
              })}\n\n`
            )
          );
        }
      } catch {
        /* ignore */
      }
      close();
    },
    { once: true }
  );

  return { write, close, markClosed, isClosed: () => closed || !!signal?.aborted };
}
