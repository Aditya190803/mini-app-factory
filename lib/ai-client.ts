// AI client with Google Gemini as primary, Groq as fallback
// Fallback chain: Gemini Main → retry → Gemini Fallback → Groq Main → Groq Fallback

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { generateText, streamText } from 'ai';
import type { ModelMessage, TextPart, ImagePart } from 'ai';

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
  createSession: (opts?: { 
    model?: string; 
    providerId?: string; 
    systemMessage?: { content: string } 
  }) => Promise<AIClientSession>;
  stop?: () => Promise<void>;
}

export interface AIClientSession {
  sendAndWait: (opts: { prompt: string, images?: Array<{ url: string }> }, timeout?: number) => Promise<{ data: { content: string } }>;
  stream: (opts: { prompt: string }) => Promise<AsyncIterable<string>>;
  on: (cb: (e: SessionEvent) => void) => () => void;
  destroy: () => Promise<void>;
}

type UserContentPart = TextPart | ImagePart;

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

/** Provider step in the fallback chain */
type ProviderStep = {
  label: string;
  providerId: 'google' | 'groq';
  model: string;
  createModel: () => ReturnType<ReturnType<typeof createGoogleGenerativeAI>> | ReturnType<ReturnType<typeof createGroq>>;
  /** How many times to attempt this step (including the first try) */
  maxAttempts: number;
};

/**
 * Build the ordered fallback chain from environment config.
 */
function buildFallbackChain(): ProviderStep[] {
  const steps: ProviderStep[] = [];

  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (googleKey) {
    const google = createGoogleGenerativeAI({ apiKey: googleKey });
    const mainModel = process.env.GOOGLE_MODEL || 'gemini-3-flash-preview';
    const fallbackModel = process.env.GOOGLE_FALLBACK_MODEL || 'gemini-2.5-flash';

    steps.push({
      label: `Google Gemini (${mainModel})`,
      providerId: 'google',
      model: mainModel,
      createModel: () => google(mainModel),
      maxAttempts: 2, // initial try + 1 retry
    });

    steps.push({
      label: `Google Gemini fallback (${fallbackModel})`,
      providerId: 'google',
      model: fallbackModel,
      createModel: () => google(fallbackModel),
      maxAttempts: 1,
    });
  }

  if (groqKey) {
    const groq = createGroq({ apiKey: groqKey });
    const groqMain = process.env.GROQ_MODEL || 'moonshotai/kimi-k2-instruct-0905';
    const groqFallback = process.env.GROQ_FALLBACK_MODEL || 'qwen/qwen3-32b';

    steps.push({
      label: `Groq (${groqMain})`,
      providerId: 'groq',
      model: groqMain,
      createModel: () => groq(groqMain),
      maxAttempts: 1,
    });

    steps.push({
      label: `Groq fallback (${groqFallback})`,
      providerId: 'groq',
      model: groqFallback,
      createModel: () => groq(groqFallback),
      maxAttempts: 1,
    });
  }

  return steps;
}

function isRetryableError(msg: string): boolean {
  const low = msg.toLowerCase();
  return (
    /timeout|timed out|abort/i.test(low) ||
    /econnreset|econnrefused|enotfound|eai_again|fetch failed|network/i.test(low) ||
    /rate.?limit|429|too many requests/i.test(low) ||
    /5\d\d/.test(low) ||
    /temporarily unavailable|overloaded|capacity|high demand|try again later|resource.?exhausted/i.test(low)
  );
}

async function runWithFallbackChain<T>(
  chain: ProviderStep[],
  task: (step: ProviderStep) => Promise<T>,
  listeners: Array<(e: SessionEvent) => void>,
): Promise<T> {
  let lastError: unknown;

  for (const step of chain) {
    for (let attempt = 1; attempt <= step.maxAttempts; attempt++) {
      try {
        listeners.forEach(l => l({
          type: 'provider.selected',
          data: {
            message: `Using ${step.label}`,
            providerId: step.providerId,
            model: step.model,
            label: step.label,
          }
        }));
        return await task(step);
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retryNote = attempt < step.maxAttempts ? ` (retry ${attempt}/${step.maxAttempts})` : '';

        console.warn(`[AI Client] ${step.label} failed${retryNote}: ${msg}`);

        // Notify listeners about the fallback
        listeners.forEach(l => l({
          type: 'provider.fallback',
          data: {
            message: `${step.label} failed${retryNote}, trying next provider...`,
            error: msg,
          }
        }));

        // Non-transient errors (provider down, auth, model not found) → skip to next provider immediately
        if (!isRetryableError(msg)) {
          console.warn(`[AI Client] Non-retryable error from ${step.label}, skipping to next provider`);
          break;
        }

        // Brief delay before retry/next step
        if (attempt < step.maxAttempts || chain.indexOf(step) < chain.length - 1) {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }
  }

  throw lastError ?? new Error('All AI providers failed');
}

/**
 * Get the AI client that handles Google Gemini as primary and Groq as fallback.
 *
 * Fallback chain:
 *   1. Google Gemini main model (retry once on failure)
 *   2. Google Gemini fallback model
 *   3. Groq main model
 *   4. Groq fallback model
 */
export async function getAIClient(): Promise<AIClient> {
  if (singletonClient && process.env.NODE_ENV !== 'test') return singletonClient;

  loadEnv();

  const googleKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const groqKey = process.env.GROQ_API_KEY;

  if (!googleKey && !groqKey) {
    throw new Error('Neither GOOGLE_GENERATIVE_AI_API_KEY nor GROQ_API_KEY is set. Please configure at least one AI provider.');
  }

  const chain = buildFallbackChain();

  const client: AIClient = {
    createSession: async (opts) => {
      const listeners: Array<(e: SessionEvent) => void> = [];
      const controllers: Set<AbortController> = new Set();

      const session: AIClientSession = {
        on(cb: (e: SessionEvent) => void) {
          listeners.push(cb);
          return () => {
            const idx = listeners.indexOf(cb);
            if (idx !== -1) listeners.splice(idx, 1);
          };
        },

        async sendAndWait({ prompt, images }: { prompt: string, images?: Array<{ url: string }> }, timeout = 180000) {
          return runWithFallbackChain(chain, async (step) => {
            const controller = new AbortController();
            controllers.add(controller);
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            try {
              const messages: ModelMessage[] = [];

              if (opts?.systemMessage?.content) {
                messages.push({ role: 'system', content: opts.systemMessage.content });
              }

              if (images && images.length > 0) {
                const userContent: UserContentPart[] = [{ type: 'text', text: prompt }];
                images.forEach(img => {
                  userContent.push({ type: 'image', image: img.url });
                });
                messages.push({ role: 'user', content: userContent });
              } else {
                messages.push({ role: 'user', content: prompt });
              }

              const result = await generateText({
                model: step.createModel(),
                messages,
                maxRetries: 0, // Disable SDK internal retries — we handle retries via fallback chain
                abortSignal: controller.signal,
              });

              const content = result.text || '';
              listeners.forEach((l) => l({ type: 'assistant.message', data: { content } }));
              return { data: { content } };
            } catch (err: unknown) {
              let m = err instanceof Error ? err.message : String(err);
              const isAbortError = err instanceof Error && err.name === 'AbortError';

              if (isAbortError || /timed out|timeout/i.test(m)) {
                m = `Request to ${step.label} timed out.`;
              } else if (/fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/i.test(m)) {
                m = `Network error contacting ${step.label}.`;
              } else if (/401|403|authentication|unauthorized/i.test(m)) {
                m = `${step.label} authentication failed. Check your API key.`;
              }

              throw new Error(m);
            } finally {
              clearTimeout(timeoutId);
              controllers.delete(controller);
            }
          }, listeners);
        },

        async stream({ prompt }: { prompt: string }) {
          return runWithFallbackChain(chain, async (step) => {
            const controller = new AbortController();
            controllers.add(controller);
            // Timeout for stream initiation (not the full stream duration)
            const streamTimeout = setTimeout(() => controller.abort(), 60000);

            try {
              const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];

              if (opts?.systemMessage?.content) {
                messages.push({ role: 'system', content: opts.systemMessage.content });
              }
              messages.push({ role: 'user', content: prompt });

              const result = await streamText({
                model: step.createModel(),
                messages: messages.map(m => ({ role: m.role, content: m.content })),
                maxRetries: 0, // Disable SDK internal retries — we handle retries via fallback chain
                abortSignal: controller.signal,
              });

              // Stream connected successfully, clear the initiation timeout
              clearTimeout(streamTimeout);
              return result.textStream;
            } catch (err: unknown) {
              clearTimeout(streamTimeout);
              const m = err instanceof Error ? err.message : String(err);
              throw new Error(m);
            }
          }, listeners);
        },

        async destroy() {
          controllers.forEach(c => c.abort());
          controllers.clear();
        },
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
