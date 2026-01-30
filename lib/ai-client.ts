// OpenRouter-backed AI client.
// Mirrors the minimal session API used across the app.

export type SessionEvent = { type: string; data: any };

export interface AIClient {
  createSession: (opts?: { model?: string; systemMessage?: { content: string } }) => Promise<AIClientSession>;
}

export interface AIClientSession {
  sendAndWait: (opts: { prompt: string }, timeout?: number) => Promise<{ data: { content: string } }>;
  on: (cb: (e: SessionEvent) => void) => () => void;
  destroy: () => Promise<void>;
}

let singletonClient: AIClient | null = null;

/**
 * Ensures .env.local is loaded even if the runner didn't load it.
 * This is helpful for certain dev environments or simple Node scripts.
 */
function loadEnv() {
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch (e) {
    // dotenv might not be available in all contexts, or .env.local might be missing
  }
}


/**
 * Return a singleton AI client that forwards requests to OpenRouter chat completions.
 * Requires OPENROUTER_API_KEY in the environment.
 */
export async function getAIClient(): Promise<AIClient> {
  if (singletonClient) return singletonClient;

  // Ensure .env.local is considered
  loadEnv();

  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set. Add it to your environment or .env.local and restart the dev server if necessary.');

  const baseUrl = process.env.OPENROUTER_API_URL || 'https://openrouter.ai/api/v1/chat/completions';

  // Common user mistake: pointing the API URL at the OpenRouter status page
  if (/status\.openrouter/i.test(baseUrl)) {
    throw new Error('OPENROUTER_API_URL points to the OpenRouter status page. Set OPENROUTER_API_URL to https://openrouter.ai/api/v1/chat/completions or remove it to use the default.');
  }

  singletonClient = {
    createSession: async ({ model, systemMessage } = {}) => {
      const modelName = model || process.env.OPENROUTER_MODEL || 'moonshotai/kimi-k2:free';
      const listeners: Array<(e: SessionEvent) => void> = [];

      return {
        on(cb: (e: SessionEvent) => void) {
          listeners.push(cb);
          return () => {
            const idx = listeners.indexOf(cb);
            if (idx !== -1) listeners.splice(idx, 1);
          };
        },

        async sendAndWait({ prompt }: { prompt: string }, timeout = 120000) {
          try {
            const body = {
              model: modelName,
              messages: [] as Array<{ role: string; content: string }>,
            } as any;

            if (systemMessage?.content) body.messages.push({ role: 'system', content: systemMessage.content });
            body.messages.push({ role: 'user', content: prompt });

            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), timeout);

            const resp = await fetch(baseUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
              },
              body: JSON.stringify(body),
              signal: controller.signal,
            });
            clearTimeout(id);

            if (!resp.ok) {
              // Try to provide a helpful error for common failure modes
              const txt = await resp.text().catch(() => '');
              let errMsg = `OpenRouter error: ${resp.status} ${txt}`;
              if (resp.status === 401 || resp.status === 403) {
                errMsg = `OpenRouter authentication failed (status ${resp.status}). Check your OPENROUTER_API_KEY.`;
              } else if (resp.status === 503) {
                errMsg = `OpenRouter service unavailable (503). The OpenRouter service may be down or unreachable from this environment.`;
              }

              listeners.forEach((l) => l({ type: 'session.error', data: { message: errMsg } }));
              throw new Error(errMsg);
            }

            const json = await resp.json();
            // Try multiple response shapes
            let content = '';
            if (json.choices && json.choices[0]) {
              if (json.choices[0].message?.content) content = json.choices[0].message.content;
              else if (typeof json.choices[0].text === 'string') content = json.choices[0].text;
            } else if (json.output?.[0]?.content?.[0]?.text) {
              content = json.output[0].content[0].text;
            } else if (typeof json.text === 'string') {
              content = json.text;
            }

            listeners.forEach((l) => l({ type: 'assistant.message', data: { content } }));

            return { data: { content } };
          } catch (err: any) {
            // Normalize common network/timeout errors into actionable messages
            let m = err instanceof Error ? err.message : String(err);

            if (err?.name === 'AbortError' || /timed out|timeout/i.test(m)) {
              m = 'Request to OpenRouter timed out. The operation took too long.';
            } else if (/fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/i.test(m)) {
              m = 'Network error contacting OpenRouter. Ensure OPENROUTER_API_KEY is set and the server can reach https://openrouter.ai';
            }

            listeners.forEach((l) => l({ type: 'session.error', data: { message: m } }));
            throw new Error(m);
          }
        },

        async destroy() {
          // no-op
        },
      };
    },
  };

  return singletonClient;
}

/**
 * Helper wrapper to run a short-lived operation with a single session.
 */
export async function withSession<T>(client: AIClient, fn: (session: AIClientSession) => Promise<T>): Promise<T> {
  const session = await client.createSession();
  try {
    return await fn(session);
  } finally {
    await session.destroy().catch(() => {});
  }
}

/**
 * Wait for a specific session event once and return it.
 */
export async function waitForEvent(session: { on: (cb: (e: SessionEvent) => void) => () => void }, eventType: string): Promise<SessionEvent> {
  return new Promise((resolve) => {
    const unsubscribe = session.on((event: SessionEvent) => {
      if (event.type === eventType) {
        unsubscribe();
        resolve(event);
      }
    });
  });
}
