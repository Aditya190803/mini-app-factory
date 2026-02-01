// AI client with Cerebras as primary, Groq + Moonshot AI as fallback
// Primary: zai-glm-4.7 via Cerebras SDK
// Fallback: moonshotai/kimi-k2-instruct-0905 via Groq

import { createGroq } from '@ai-sdk/groq';
import { generateText, streamText } from 'ai';

export type SessionEvent = { 
  type: string; 
  data: {
    message?: string;
    error?: string;
    content?: string;
    [key: string]: unknown;
  } 
};

export interface AIClient {
  createSession: (opts?: { model?: string; systemMessage?: { content: string } }) => Promise<AIClientSession>;
  stop?: () => Promise<void>;
}

export interface AIClientSession {
  sendAndWait: (opts: { prompt: string }, timeout?: number) => Promise<{ data: { content: string } }>;
  stream: (opts: { prompt: string }) => Promise<AsyncIterable<string>>;
  on: (cb: (e: SessionEvent) => void) => () => void;
  destroy: () => Promise<void>;
}

let singletonClient: AIClient | null = null;

/**
 * Ensures .env.local is loaded even if the runner didn't load it.
 */
function loadEnv() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch {
    // dotenv might not be available in all contexts
  }
}

/**
 * Create Cerebras client as primary
 */
function createCerebrasClient(): AIClient {
  const { createCerebras } = require('@ai-sdk/cerebras');
  const key = process.env.CEREBRAS_API_KEY;
  if (!key) {
    throw new Error('CEREBRAS_API_KEY is not set. Add it to your environment or .env.local');
  }

  const provider = createCerebras({ apiKey: key });
  const primaryModel = process.env.CEREBRAS_MODEL || 'gpt-oss-120b'; // Prefer env or sensible default

  return {
    createSession: async ({ model, systemMessage } = {}) => {
      const modelName = model || primaryModel;
      const listeners: Array<(e: SessionEvent) => void> = [];
      const controllers: Set<AbortController> = new Set();

      return {
        on(cb: (e: SessionEvent) => void) {
          listeners.push(cb);
          return () => {
            const idx = listeners.indexOf(cb);
            if (idx !== -1) listeners.splice(idx, 1);
          };
        },

        async sendAndWait({ prompt }: { prompt: string }, timeout = 120000) {
          const controller = new AbortController();
          controllers.add(controller);
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          try {
            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

            if (systemMessage?.content) {
              messages.push({ role: 'system', content: systemMessage.content });
            }
            messages.push({ role: 'user', content: prompt });

            const result = await generateText({
              model: provider(modelName),
              messages: messages.map(m => ({ role: m.role, content: m.content })),
              abortSignal: controller.signal,
            });

            const content = result.text || '';
            listeners.forEach((l) => l({ type: 'assistant.message', data: { content } }));
            return { data: { content } };
          } catch (err: unknown) {
            let m = err instanceof Error ? err.message : String(err);
            const isAbortError = err instanceof Error && err.name === 'AbortError';

            if (isAbortError || /timed out|timeout/i.test(m)) {
              m = 'Request to Cerebras timed out.';
            } else if (/fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/i.test(m)) {
              m = 'Network error contacting Cerebras.';
            } else if (/401|403|authentication|unauthorized/i.test(m)) {
              m = `Cerebras authentication failed. Check CEREBRAS_API_KEY.`;
            }

            listeners.forEach((l) => l({ type: 'session.error', data: { message: m } }));
            throw new Error(m);
          } finally {
            clearTimeout(timeoutId);
            controllers.delete(controller);
          }
        },

        async stream({ prompt }: { prompt: string }) {
          const controller = new AbortController();
          controllers.add(controller);

          try {
            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

            if (systemMessage?.content) {
              messages.push({ role: 'system', content: systemMessage.content });
            }
            messages.push({ role: 'user', content: prompt });

            const result = await streamText({
              model: provider(modelName),
              messages: messages.map(m => ({ role: m.role, content: m.content })),
              abortSignal: controller.signal,
            });

            return result.textStream;
          } catch (err: unknown) {
            let m = err instanceof Error ? err.message : String(err);
            listeners.forEach((l) => l({ type: 'session.error', data: { message: m } }));
            throw new Error(m);
          }
        },

        async destroy() {
          controllers.forEach(c => c.abort());
          controllers.clear();
        },
      };
    },
  };
}

/**
 * Create Groq client for Moonshot AI model as fallback
 */
function createGroqClient(): AIClient {
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    throw new Error('GROQ_API_KEY is not set. Add it to your environment or .env.local');
  }

  const groq = createGroq({ apiKey: key });
  const fallbackModel = 'qwen/qwen3-32b'; // Fallback model

  return {
    createSession: async ({ model, systemMessage } = {}) => {
      const modelName = model || fallbackModel;
      const listeners: Array<(e: SessionEvent) => void> = [];
      const controllers: Set<AbortController> = new Set();

      return {
        on(cb: (e: SessionEvent) => void) {
          listeners.push(cb);
          return () => {
            const idx = listeners.indexOf(cb);
            if (idx !== -1) listeners.splice(idx, 1);
          };
        },

        async sendAndWait({ prompt }: { prompt: string }, timeout = 120000) {
          const controller = new AbortController();
          controllers.add(controller);
          const timeoutId = setTimeout(() => controller.abort(), timeout);

          try {
            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

            if (systemMessage?.content) {
              messages.push({ role: 'system', content: systemMessage.content });
            }
            messages.push({ role: 'user', content: prompt });

            const result = await generateText({
              model: groq(modelName),
              messages: messages.map(m => ({ role: m.role, content: m.content })),
              abortSignal: controller.signal,
            });

            const content = result.text || '';
            listeners.forEach((l) => l({ type: 'assistant.message', data: { content } }));
            return { data: { content } };
          } catch (err: unknown) {
            let m = err instanceof Error ? err.message : String(err);
            const isAbortError = err instanceof Error && err.name === 'AbortError';

            if (isAbortError || /timed out|timeout/i.test(m)) {
              m = 'Request to Groq timed out.';
            } else if (/fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/i.test(m)) {
              m = 'Network error contacting Groq.';
            } else if (/401|403|authentication|unauthorized/i.test(m)) {
              m = `Groq authentication failed. Check GROQ_API_KEY.`;
            }

            listeners.forEach((l) => l({ type: 'session.error', data: { message: m } }));
            throw new Error(m);
          } finally {
            clearTimeout(timeoutId);
            controllers.delete(controller);
          }
        },

        async stream({ prompt }: { prompt: string }) {
          const controller = new AbortController();
          controllers.add(controller);

          try {
            const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

            if (systemMessage?.content) {
              messages.push({ role: 'system', content: systemMessage.content });
            }
            messages.push({ role: 'user', content: prompt });

            const result = await streamText({
              model: groq(modelName),
              messages: messages.map(m => ({ role: m.role, content: m.content })),
              abortSignal: controller.signal,
            });

            return result.textStream;
          } catch (err: unknown) {
            let m = err instanceof Error ? err.message : String(err);
            listeners.forEach((l) => l({ type: 'session.error', data: { message: m } }));
            throw new Error(m);
          }
        },

        async destroy() {
          controllers.forEach(c => c.abort());
          controllers.clear();
        },
      };
    },
  };
}

/**
 * Get the AI client that handles Cerebras as primary and Groq as fallback
 */
export async function getAIClient(): Promise<AIClient> {
  if (singletonClient && process.env.NODE_ENV !== 'test') return singletonClient;

  loadEnv();

  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!cerebrasKey && !groqKey) {
    throw new Error('Neither CEREBRAS_API_KEY nor GROQ_API_KEY is set. Please configure at least one AI provider.');
  }

  const cerebrasClient = cerebrasKey ? createCerebrasClient() : null;
  const groqClient = groqKey ? createGroqClient() : null;

  const client: AIClient = {
    createSession: async (opts) => {
      let primarySession = (cerebrasClient && cerebrasClient.createSession) ? await cerebrasClient.createSession(opts) : null;
      let fallbackSession: AIClientSession | null = null;
      const listeners: Array<(e: SessionEvent) => void> = [];

      // Helper to attach a session to our listener pool
      const attachSession = (s: AIClientSession) => {
        s.on((event) => {
          // Avoid duplicate processing if needed, but here we just propagate
          listeners.forEach((l) => l(event));
        });
      };

      if (primarySession) attachSession(primarySession);

      const session: AIClientSession = {
        on(cb) {
          listeners.push(cb);
          return () => {
            const idx = listeners.indexOf(cb);
            if (idx !== -1) listeners.splice(idx, 1);
          };
        },

        async sendAndWait(sendOpts, timeout) {
          if (fallbackSession) {
            return await fallbackSession.sendAndWait(sendOpts, timeout);
          }

          if (primarySession) {
            try {
              return await primarySession.sendAndWait(sendOpts, timeout);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn('[AI Client] Primary provider (Cerebras) failed, trying fallback:', message);

              listeners.forEach(l => l({
                type: 'provider.fallback',
                data: { message: 'Main model failed, switching to fallback...', error: message }
              }));

              if (!groqClient) throw err;

              fallbackSession = await groqClient.createSession(opts);
              attachSession(fallbackSession);
              return await fallbackSession.sendAndWait(sendOpts, timeout);
            }
          } else if (groqClient) {
            fallbackSession = await groqClient.createSession(opts);
            attachSession(fallbackSession);
            return await fallbackSession.sendAndWait(sendOpts, timeout);
          } else {
            throw new Error('No AI providers available');
          }
        },

        async stream(sendOpts) {
          if (fallbackSession) {
            return await fallbackSession.stream(sendOpts);
          }

          if (primarySession) {
            try {
              return await primarySession.stream(sendOpts);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              console.warn('[AI Client] Primary provider (Cerebras) failed, trying fallback for stream:', message);

              listeners.forEach(l => l({
                type: 'provider.fallback',
                data: { message: 'Main model failed, switching to fallback for stream...', error: message }
              }));

              if (!groqClient) throw err;

              fallbackSession = await groqClient.createSession(opts);
              attachSession(fallbackSession);
              return await fallbackSession.stream(sendOpts);
            }
          } else if (groqClient) {
            fallbackSession = await groqClient.createSession(opts);
            attachSession(fallbackSession);
            return await fallbackSession.stream(sendOpts);
          } else {
            throw new Error('No AI providers available');
          }
        },

        async destroy() {
          await primarySession?.destroy();
          await fallbackSession?.destroy();
        }
      };

      return session;
    }
  };

  if (process.env.NODE_ENV !== 'test') {
    singletonClient = client;
  }
  return client;
}

/**
 * Helper wrapper to run a short-lived operation with a single session.
 */
export async function withSession<T>(client: AIClient, fn: (session: AIClientSession) => Promise<T>): Promise<T> {
  const session = await client.createSession();
  try {
    return await fn(session);
  } finally {
    await session.destroy().catch(() => { });
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

/**
 * Gracefully shutdown the AI client
 */
export async function shutdownAIClient() {
  if (singletonClient && 'stop' in singletonClient && singletonClient.stop) {
    await singletonClient.stop();
  }
  singletonClient = null;
}
