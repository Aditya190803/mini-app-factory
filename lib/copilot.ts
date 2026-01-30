import { CopilotClient } from '@github/copilot-sdk';
import type { CopilotSession, SessionEvent } from '@github/copilot-sdk';

let clientInstance: CopilotClient | null = null;
let clientPromise: Promise<CopilotClient> | null = null;

/**
 * Return the singleton CopilotClient, starting it if necessary. This mirrors patterns used
 * in the codebase (start once and reuse). It also checks auth status and throws a helpful
 * error if authentication is not available.
 */
export async function getCopilotClient(options?: { logLevel?: 'none' | 'error' | 'info' | 'warning' | 'debug' | 'all' }): Promise<CopilotClient> {
  if (clientInstance) return clientInstance;

  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const client = new CopilotClient({ logLevel: options?.logLevel || 'info' });
        await client.start();

        // If method exists (depends on SDK version), check auth status and log it.
        try {
          const maybeAuthClient = client as unknown as { getAuthStatus?: () => Promise<{ isAuthenticated?: boolean; statusMessage?: string }> };
          const getAuthStatusFn = maybeAuthClient.getAuthStatus;
          const authStatus = typeof getAuthStatusFn === 'function' ? await getAuthStatusFn.call(client) : undefined;
          if (authStatus && !authStatus.isAuthenticated) {
            throw new Error(`Copilot authentication failed: ${authStatus.statusMessage || 'No authentication available'}`);
          }
        } catch (err) {
          // If we couldn't check auth, still proceed but warn
          console.warn('[Copilot] Warning: failed to check auth status', err);
        }

        clientInstance = client;
        return client;
      } catch (err) {
        clientPromise = null;
        throw err;
      }
    })();
  }

  return clientPromise;
}

/**
 * Helper wrapper to ensure cleanup of client start/stop.
 */
export async function withClient<T>(fn: (client: CopilotClient) => Promise<T>): Promise<T> {
  const client = new CopilotClient();
  try {
    await client.start();
    return await fn(client);
  } finally {
    await client.stop().catch(() => {});
  }
}

/**
 * Helper wrapper to ensure session destruction.
 */
export async function withSession<T>(client: CopilotClient, fn: (session: CopilotSession) => Promise<T>): Promise<T> {
  const session = await client.createSession();
  try {
    return await fn(session);
  } finally {
    await session.destroy().catch(() => {});
  }
}

/**
 * Wait for a specific session event type once and return it.
 */
export async function waitForEvent<T extends SessionEvent['type']>(session: { on: (cb: (e: SessionEvent) => void) => () => void }, eventType: T): Promise<Extract<SessionEvent, { type: T }>> {
  return new Promise((resolve) => {
    const unsubscribe = session.on((event: SessionEvent) => {
      if (event.type === eventType) {
        unsubscribe();
        resolve(event as Extract<SessionEvent, { type: T }>);
      }
    });
  });
}
