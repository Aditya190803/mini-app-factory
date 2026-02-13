import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createCerebras } from '@ai-sdk/cerebras';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, streamText } from 'ai';
import type { ModelMessage, TextPart, ImagePart } from 'ai';
import type { AIProviderId } from '@/lib/ai-admin-config';
import type { AIRuntimeConfig } from '@/lib/ai-admin-server';

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
    providerId?: AIProviderId;
    systemMessage?: { content: string };
  }) => Promise<AIClientSession>;
  stop?: () => Promise<void>;
}

export interface AIClientSession {
  sendAndWait: (opts: { prompt: string; images?: Array<{ url: string }> }, timeout?: number) => Promise<{ data: { content: string } }>;
  stream: (opts: { prompt: string }) => Promise<AsyncIterable<string>>;
  on: (cb: (e: SessionEvent) => void) => () => void;
  destroy: () => Promise<void>;
}

type UserContentPart = TextPart | ImagePart;

type ProviderStep = {
  label: string;
  providerId: AIProviderId;
  model: string;
  createModel: () => unknown;
  maxAttempts: number;
};

type ProviderState = {
  enabled: boolean;
  apiKey?: string;
  defaultModel: string;
  fallbackModel?: string;
};

type ProviderStateMap = Record<AIProviderId, ProviderState>;

let singletonClient: AIClient | null = null;

function loadEnv() {
  if (process.env.NODE_ENV === 'test') return;
  try {
    require('dotenv').config({ path: '.env.local' });
  } catch {
    // no-op
  }
}

function getFriendlyModelName(modelId: string): string {
  const mapping: Record<string, string> = {
    'gemini-3-flash-preview': 'Gemini 3 Flash',
    'gemini-3-pro-preview': 'Gemini 3 Pro',
    'gemini-2.5-pro': 'Gemini 2.5 Pro',
    'gemini-2.5-flash': 'Gemini 2.5 Flash',
    'gemma-3-27b': 'Gemma 3 27B',
  };
  return mapping[modelId] || modelId;
}

function buildProviderStateMap(runtimeConfig?: AIRuntimeConfig): ProviderStateMap {
  const admin = runtimeConfig?.adminConfig.providers;
  const byok = runtimeConfig?.byokConfig;

  return {
    google: {
      enabled: admin?.google?.enabled ?? true,
      apiKey: byok?.google || process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      defaultModel: admin?.google?.defaultModel || process.env.GOOGLE_MODEL || 'gemini-3-flash-preview',
      fallbackModel: process.env.GOOGLE_FALLBACK_MODEL || 'gemini-2.5-flash',
    },
    groq: {
      enabled: admin?.groq?.enabled ?? true,
      apiKey: byok?.groq || process.env.GROQ_API_KEY,
      defaultModel: admin?.groq?.defaultModel || process.env.GROQ_MODEL || 'moonshotai/kimi-k2-instruct-0905',
      fallbackModel: process.env.GROQ_FALLBACK_MODEL || 'qwen/qwen3-32b',
    },
    openrouter: {
      enabled: admin?.openrouter?.enabled ?? true,
      apiKey: byok?.openrouter || process.env.OPENROUTER_API_KEY,
      defaultModel: admin?.openrouter?.defaultModel || process.env.OPENROUTER_MODEL || 'openai/gpt-oss-120b',
      fallbackModel: process.env.OPENROUTER_FALLBACK_MODEL,
    },
    cerebras: {
      enabled: admin?.cerebras?.enabled ?? true,
      apiKey: byok?.cerebras || process.env.CEREBRAS_API_KEY,
      defaultModel: admin?.cerebras?.defaultModel || process.env.CEREBRAS_MODEL || 'llama-3.3-70b',
      fallbackModel: process.env.CEREBRAS_FALLBACK_MODEL,
    },
  };
}

function hasConfiguredProvider(runtimeConfig?: AIRuntimeConfig) {
  const state = buildProviderStateMap(runtimeConfig);
  return Object.values(state).some((provider) => provider.enabled && !!provider.apiKey);
}

function buildProviderFactories(state: ProviderStateMap) {
  const google = state.google.apiKey ? createGoogleGenerativeAI({ apiKey: state.google.apiKey }) : null;
  const groq = state.groq.apiKey ? createGroq({ apiKey: state.groq.apiKey }) : null;
  const openrouter = state.openrouter.apiKey ? createOpenRouter({ apiKey: state.openrouter.apiKey }) : null;
  const cerebras = state.cerebras.apiKey ? createCerebras({ apiKey: state.cerebras.apiKey }) : null;

  return {
    google,
    groq,
    openrouter,
    cerebras,
  };
}

function buildFallbackChain(runtimeConfig?: AIRuntimeConfig, opts?: { model?: string; providerId?: AIProviderId }): ProviderStep[] {
  const steps: ProviderStep[] = [];
  const seen = new Set<string>();
  const state = buildProviderStateMap(runtimeConfig);
  const factories = buildProviderFactories(state);

  const addStep = (step: ProviderStep) => {
    const key = `${step.providerId}:${step.model}`;
    if (seen.has(key)) return;
    seen.add(key);
    steps.push(step);
  };

  const configuredOrder = runtimeConfig?.adminConfig.providerOrder;
  const order: AIProviderId[] = configuredOrder && configuredOrder.length > 0
    ? configuredOrder
    : ['google', 'groq', 'openrouter', 'cerebras'];
  const prioritized = opts?.providerId
    ? [opts.providerId, ...order.filter((providerId) => providerId !== opts.providerId)]
    : order;

  if (opts?.providerId && opts?.model) {
    const selectedModel = opts.model;
    const providerFactory = factories[opts.providerId];
    const providerState = state[opts.providerId];
    if (providerFactory && providerState.enabled && providerState.apiKey) {
      addStep({
        label: `${opts.providerId.toUpperCase()} (${getFriendlyModelName(selectedModel)})`,
        providerId: opts.providerId,
        model: selectedModel,
        createModel: () => providerFactory(selectedModel),
        maxAttempts: opts.providerId === 'google' ? 2 : 1,
      });
    }
  }

  for (const providerId of prioritized) {
    const providerFactory = factories[providerId];
    const providerState = state[providerId];
    if (!providerFactory || !providerState.enabled || !providerState.apiKey) continue;

    addStep({
      label: `${providerId.toUpperCase()} (${getFriendlyModelName(providerState.defaultModel)})`,
      providerId,
      model: providerState.defaultModel,
      createModel: () => providerFactory(providerState.defaultModel),
      maxAttempts: providerId === 'google' ? 2 : 1,
    });

    if (providerState.fallbackModel && providerState.fallbackModel !== providerState.defaultModel) {
      addStep({
        label: `${providerId.toUpperCase()} fallback (${getFriendlyModelName(providerState.fallbackModel)})`,
        providerId,
        model: providerState.fallbackModel,
        createModel: () => providerFactory(providerState.fallbackModel!),
        maxAttempts: 1,
      });
    }
  }

  return steps;
}

function isRetryableError(msg: string): boolean {
  const lowered = msg.toLowerCase();
  return (
    /timeout|timed out|abort/i.test(lowered) ||
    /econnreset|econnrefused|enotfound|eai_again|fetch failed|network/i.test(lowered) ||
    /rate.?limit|429|too many requests/i.test(lowered) ||
    /5\d\d/.test(lowered) ||
    /temporarily unavailable|overloaded|capacity|high demand|try again later|resource.?exhausted/i.test(lowered)
  );
}

async function runWithFallbackChain<T>(
  chain: ProviderStep[],
  task: (step: ProviderStep) => Promise<T>,
  listeners: Array<(event: SessionEvent) => void>
): Promise<T> {
  let lastError: unknown;

  for (let stepIndex = 0; stepIndex < chain.length; stepIndex++) {
    const step = chain[stepIndex];
    for (let attempt = 1; attempt <= step.maxAttempts; attempt++) {
      try {
        listeners.forEach((listener) => listener({
          type: 'provider.selected',
          data: {
            message: `Using ${step.label}`,
            providerId: step.providerId,
            model: step.model,
            label: step.label,
          },
        }));
        return await task(step);
      } catch (err) {
        lastError = err;
        const message = err instanceof Error ? err.message : String(err);
        const retryNote = attempt < step.maxAttempts ? ` (retry ${attempt}/${step.maxAttempts})` : '';

        listeners.forEach((listener) => listener({
          type: 'provider.fallback',
          data: {
            message: `${step.label} failed${retryNote}, trying next provider...`,
            error: message,
          },
        }));

        if (!isRetryableError(message)) {
          break;
        }

        if (attempt < step.maxAttempts || stepIndex < chain.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
        }
      }
    }
  }

  throw lastError ?? new Error('All AI providers failed');
}

export async function getAIClient(runtimeConfig?: AIRuntimeConfig): Promise<AIClient> {
  const canUseSingleton = !runtimeConfig && process.env.NODE_ENV !== 'test';
  if (singletonClient && canUseSingleton) return singletonClient;

  loadEnv();

  if (!hasConfiguredProvider(runtimeConfig)) {
    throw new Error('At least one AI provider key must be configured (Google, Groq, OpenRouter, or Cerebras).');
  }

  const client: AIClient = {
    createSession: async (opts) => {
      const listeners: Array<(event: SessionEvent) => void> = [];
      const controllers: Set<AbortController> = new Set();
      const chain = buildFallbackChain(runtimeConfig, { model: opts?.model, providerId: opts?.providerId });

      if (chain.length === 0) {
        throw new Error('No enabled provider with a valid key is available.');
      }

      const session: AIClientSession = {
        on(cb: (event: SessionEvent) => void) {
          listeners.push(cb);
          return () => {
            const idx = listeners.indexOf(cb);
            if (idx !== -1) listeners.splice(idx, 1);
          };
        },

        async sendAndWait({ prompt, images }: { prompt: string; images?: Array<{ url: string }> }, timeout = 180000) {
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
                images.forEach((img) => userContent.push({ type: 'image', image: img.url }));
                messages.push({ role: 'user', content: userContent });
              } else {
                messages.push({ role: 'user', content: prompt });
              }

              const result = await generateText({
                model: step.createModel() as never,
                messages,
                maxRetries: 0,
                abortSignal: controller.signal,
              });

              const content = result.text || '';
              listeners.forEach((listener) => listener({ type: 'assistant.message', data: { content } }));
              return { data: { content } };
            } catch (err: unknown) {
              let message = err instanceof Error ? err.message : String(err);
              const isAbort = err instanceof Error && err.name === 'AbortError';

              if (isAbort || /timed out|timeout/i.test(message)) {
                message = `Request to ${step.label} timed out.`;
              } else if (/fetch failed|network|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET/i.test(message)) {
                message = `Network error contacting ${step.label}.`;
              } else if (/401|403|authentication|unauthorized/i.test(message)) {
                message = `${step.label} authentication failed. Check your API key.`;
              }

              throw new Error(message);
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
            const streamTimeout = setTimeout(() => controller.abort(), 60000);

            try {
              const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
              if (opts?.systemMessage?.content) {
                messages.push({ role: 'system', content: opts.systemMessage.content });
              }
              messages.push({ role: 'user', content: prompt });

              const result = await streamText({
                model: step.createModel() as never,
                messages,
                maxRetries: 0,
                abortSignal: controller.signal,
              });

              clearTimeout(streamTimeout);
              return result.textStream;
            } catch (err: unknown) {
              clearTimeout(streamTimeout);
              const message = err instanceof Error ? err.message : String(err);
              throw new Error(message);
            }
          }, listeners);
        },

        async destroy() {
          controllers.forEach((controller) => controller.abort());
          controllers.clear();
        },
      };

      return session;
    },
  };

  if (canUseSingleton) {
    singletonClient = client;
  }

  return client;
}

export async function withSession<T>(client: AIClient, fn: (session: AIClientSession) => Promise<T>): Promise<T> {
  const session = await client.createSession();
  try {
    return await fn(session);
  } finally {
    await session.destroy().catch(() => { });
  }
}

export async function waitForEvent(
  session: { on: (cb: (e: SessionEvent) => void) => () => void },
  eventType: string
): Promise<SessionEvent> {
  return new Promise((resolve) => {
    const unsubscribe = session.on((event: SessionEvent) => {
      if (event.type === eventType) {
        unsubscribe();
        resolve(event);
      }
    });
  });
}

export async function shutdownAIClient() {
  if (singletonClient && 'stop' in singletonClient && singletonClient.stop) {
    await singletonClient.stop();
  }
  singletonClient = null;
}
