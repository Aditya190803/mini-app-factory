import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateText, streamText } from 'ai';
import type { ModelMessage, TextPart, ImagePart } from 'ai';
import { isAllowedProviderModel, resolveSelectedAIModel, type AIProviderId } from '@/lib/ai-admin-config';
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
  sendAndWait: (opts: { prompt: string; images?: Array<{ url: string }>; maxOutputTokens?: number }, timeout?: number) => Promise<{ data: { content: string } }>;
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
    'big-pickle': 'Big Pickle',
    'mimo-v2.5-free': 'MiMo V2.5 Free',
    'deepseek-v4-flash-free': 'DeepSeek V4 Flash Free',
    'longcat-2.0-free': 'LongCat 2.0 Free',
    'openrouter/free': 'Free Models Router',
    'z-ai/glm-5.2:free': 'GLM 5.2 Free',
    'nvidia/nemotron-3.5-lightning:free': 'Nemotron 3.5 Lightning Free',
    'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron 3 Ultra Free',
    'minimax/minimax-m2.7:free': 'MiniMax M2.7 Free',
    'poolside/laguna-s-2.1:free': 'Laguna S 2.1 Free',
    'google/gemma-4-31b-it:free': 'Gemma 4 31B Free',
  };
  return mapping[modelId] || modelId;
}

function buildProviderStateMap(runtimeConfig?: AIRuntimeConfig): ProviderStateMap {
  const admin = runtimeConfig?.adminConfig.providers;
  const byok = runtimeConfig?.byokConfig;
  const requestedOpenCodeModel = admin?.opencode?.defaultModel || process.env.OPENCODE_MODEL || 'deepseek-v4-flash-free';
  const requestedOpenCodeFallback = process.env.OPENCODE_FALLBACK_MODEL;

  const requestedOpenRouterModel = admin?.openrouter?.defaultModel || process.env.OPENROUTER_MODEL || 'openrouter/free';
  const requestedOpenRouterFallback = process.env.OPENROUTER_FALLBACK_MODEL;

  return {
    opencode: {
      enabled: admin?.opencode?.enabled ?? true,
      apiKey: byok?.opencode || process.env.OPENCODE_API_KEY,
      defaultModel: isAllowedProviderModel('opencode', requestedOpenCodeModel) ? requestedOpenCodeModel : 'deepseek-v4-flash-free',
      fallbackModel: requestedOpenCodeFallback && isAllowedProviderModel('opencode', requestedOpenCodeFallback)
        ? requestedOpenCodeFallback
        : undefined,
    },
    openrouter: {
      enabled: admin?.openrouter?.enabled ?? true,
      apiKey: byok?.openrouter || process.env.OPENROUTER_API_KEY,
      defaultModel: isAllowedProviderModel('openrouter', requestedOpenRouterModel) ? requestedOpenRouterModel : 'openrouter/free',
      fallbackModel: requestedOpenRouterFallback && isAllowedProviderModel('openrouter', requestedOpenRouterFallback)
        ? requestedOpenRouterFallback
        : undefined,
    },
  };
}

function hasConfiguredProvider(runtimeConfig?: AIRuntimeConfig) {
  const state = buildProviderStateMap(runtimeConfig);
  return Object.values(state).some((provider) => provider.enabled && !!provider.apiKey);
}

function buildProviderFactories(state: ProviderStateMap) {
  const opencode = state.opencode.apiKey
    ? createOpenAICompatible({
        name: 'opencode',
        baseURL: 'https://opencode.ai/zen/v1',
        apiKey: state.opencode.apiKey,
      })
    : null;
  const openrouter = state.openrouter.apiKey ? createOpenRouter({ apiKey: state.openrouter.apiKey }) : null;

  return { opencode, openrouter };
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
    : ['opencode', 'openrouter'];
  const requested = resolveSelectedAIModel(opts?.model, opts?.providerId);
  const prioritized = requested
    ? [requested.providerId, ...order.filter((providerId) => providerId !== requested.providerId)]
    : order;

  if (requested) {
    const providerFactory = factories[requested.providerId];
    const providerState = state[requested.providerId];
    if (providerFactory && providerState.enabled && providerState.apiKey) {
      addStep({
        label: `${requested.providerId.toUpperCase()} (${getFriendlyModelName(requested.model)})`,
        providerId: requested.providerId,
        model: requested.model,
        createModel: () => providerFactory(requested.model),
        maxAttempts: 1,
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
      maxAttempts: 1,
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
    throw new Error('At least one AI provider key must be configured (OpenCode or OpenRouter).');
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

        async sendAndWait({ prompt, images, maxOutputTokens }: { prompt: string; images?: Array<{ url: string }>; maxOutputTokens?: number }, timeout = 180000) {
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
                maxOutputTokens,
                maxRetries: 0,
                abortSignal: controller.signal,
                providerOptions: step.providerId === 'opencode'
                  ? { opencode: { reasoningEffort: 'none', textVerbosity: 'low' } }
                  : undefined,
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
