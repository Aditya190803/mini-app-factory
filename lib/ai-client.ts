import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText, streamText } from 'ai';
import type { ModelMessage, TextPart, ImagePart } from 'ai';
import {
  DEFAULT_AI_ADMIN_CONFIG,
  DEFAULT_PROVIDER_MODELS,
  isAllowedProviderModel,
  resolveSelectedAIModel,
  type AIProviderId,
} from '@/lib/ai-admin-config';
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

/**
 * Output cap applied when a caller does not set one. Transforms set none, so a runaway model could
 * bill up to the provider's maximum on every call.
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;

import type { AIUsage } from '@/lib/ai-usage';

export type { AIUsage };

export interface AIClient {
  createSession: (opts?: {
    model?: string;
    providerId?: AIProviderId;
    systemMessage?: { content: string };
    /** Aborts every in-flight and future call on this session (the user pressed Stop). */
    signal?: AbortSignal;
    /** Epoch ms after which no new call starts and in-flight calls are cut short. */
    deadline?: number;
  }) => Promise<AIClientSession>;
  stop?: () => Promise<void>;
}

export interface AIClientSession {
  sendAndWait: (opts: { prompt: string; images?: Array<{ url: string }>; maxOutputTokens?: number }, timeout?: number) => Promise<{ data: { content: string } }>;
  stream: (opts: { prompt: string }) => Promise<AsyncIterable<string>>;
  on: (cb: (e: SessionEvent) => void) => () => void;
  /** Tokens spent by this session so far, summed across calls and fallback attempts. */
  usage: () => AIUsage;
  destroy: () => Promise<void>;
}

/** Thrown when a run is cancelled or out of time. Never triggers a provider fallback. */
export class AIRunStoppedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIRunStoppedError';
  }
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

function getFriendlyModelName(modelId: string): string {
  const mapping: Record<string, string> = {
    'big-pickle': 'Big Pickle',
    'mimo-v2.5-free': 'MiMo V2.5 Free',
    'deepseek-v4-flash-free': 'DeepSeek V4 Flash Free',
    'longcat-2.0-free': 'LongCat 2.0 Free',
    'claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'claude-opus-4-6': 'Claude Opus 4.6',
    'gemini-3.1-pro-high': 'Gemini 3.1 Pro High',
  };
  return mapping[modelId] || modelId;
}

/**
 * Whether the user brought their own key. When they did, runs use only their keys: falling back
 * to the platform key would spend platform money on a request that skipped the platform quota.
 */
export function usesOwnKeys(runtimeConfig?: AIRuntimeConfig): boolean {
  return Object.values(runtimeConfig?.byokConfig ?? {}).some(Boolean);
}

/**
 * Server-side model allowlist. The model picker only offers what the admin made visible, but the
 * request body is caller-controlled, so the check has to happen here too: on the platform's keys
 * a model must be the provider default or one the admin listed. With the user's own key any model
 * the provider accepts is fine — they pay for it.
 */
export function isModelPermitted(runtimeConfig: AIRuntimeConfig | undefined, providerId: AIProviderId, model: string): boolean {
  if (runtimeConfig?.byokConfig?.[providerId]) return true;
  const provider = runtimeConfig?.adminConfig.providers[providerId] ?? DEFAULT_AI_ADMIN_CONFIG.providers[providerId];
  return model === provider.defaultModel || provider.visibleModels.includes(model) || provider.customModels.includes(model);
}

function buildProviderStateMap(runtimeConfig?: AIRuntimeConfig): ProviderStateMap {
  const admin = runtimeConfig?.adminConfig.providers;
  const byok = runtimeConfig?.byokConfig;
  const ownKeysOnly = usesOwnKeys(runtimeConfig);
  const requestedGatewayModel = admin?.gateway?.defaultModel || process.env.AI_GATEWAY_MODEL || DEFAULT_PROVIDER_MODELS.gateway;

  const requestedOpenCodeModel = admin?.opencode?.defaultModel || process.env.OPENCODE_MODEL || DEFAULT_PROVIDER_MODELS.opencode;
  const requestedOpenCodeFallback = process.env.OPENCODE_FALLBACK_MODEL;

  return {
    gateway: {
      enabled: admin?.gateway?.enabled ?? true,
      apiKey: ownKeysOnly ? byok?.gateway : process.env.AI_GATEWAY_API_KEY,
      defaultModel: isAllowedProviderModel('gateway', requestedGatewayModel) ? requestedGatewayModel : DEFAULT_PROVIDER_MODELS.gateway,
    },
    opencode: {
      enabled: admin?.opencode?.enabled ?? true,
      apiKey: ownKeysOnly ? byok?.opencode : process.env.OPENCODE_API_KEY,
      defaultModel: isAllowedProviderModel('opencode', requestedOpenCodeModel) ? requestedOpenCodeModel : DEFAULT_PROVIDER_MODELS.opencode,
      fallbackModel: requestedOpenCodeFallback && isAllowedProviderModel('opencode', requestedOpenCodeFallback)
        ? requestedOpenCodeFallback
        : undefined,
    },
  };
}

function hasConfiguredProvider(runtimeConfig?: AIRuntimeConfig) {
  const state = buildProviderStateMap(runtimeConfig);
  return Object.values(state).some((provider) => provider.enabled && !!provider.apiKey);
}

function buildProviderFactories(state: ProviderStateMap) {
  const gatewayBaseURL = (process.env.AI_GATEWAY_BASE_URL || '').trim().replace(/\/$/, '');
  const gateway = state.gateway.apiKey && gatewayBaseURL
    ? createOpenAICompatible({
        name: 'gateway',
        baseURL: gatewayBaseURL,
        apiKey: state.gateway.apiKey,
      })
    : null;
  const opencode = state.opencode.apiKey
    ? createOpenAICompatible({
        name: 'opencode',
        baseURL: 'https://opencode.ai/zen/v1',
        apiKey: state.opencode.apiKey,
      })
    : null;
  return { gateway, opencode };
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
    : ['gateway', 'opencode'];
  const resolved = resolveSelectedAIModel(opts?.model, opts?.providerId);
  // A model outside the allowlist is ignored rather than rejected: the run proceeds on the defaults.
  const requested = resolved && isModelPermitted(runtimeConfig, resolved.providerId, resolved.model) ? resolved : undefined;
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
  listeners: Array<(event: SessionEvent) => void>,
  checkStopped: () => void = () => {}
): Promise<T> {
  let lastError: unknown;

  for (let stepIndex = 0; stepIndex < chain.length; stepIndex++) {
    const step = chain[stepIndex];
    for (let attempt = 1; attempt <= step.maxAttempts; attempt++) {
      // Cancellation and the time budget end the chain; they are not provider failures to fall
      // back from.
      checkStopped();
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
        if (err instanceof AIRunStoppedError) throw err;
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

  if (!hasConfiguredProvider(runtimeConfig)) {
    throw new Error('At least one AI provider key must be configured (AI Gateway or OpenCode).');
  }

  const client: AIClient = {
    createSession: async (opts) => {
      const listeners: Array<(event: SessionEvent) => void> = [];
      const controllers: Set<AbortController> = new Set();
      const usage: AIUsage = { inputTokens: 0, outputTokens: 0, calls: 0 };
      const chain = buildFallbackChain(runtimeConfig, { model: opts?.model, providerId: opts?.providerId });

      if (chain.length === 0) {
        throw new Error('No enabled provider with a valid key is available.');
      }

      const checkStopped = () => {
        if (opts?.signal?.aborted) throw new AIRunStoppedError('The run was cancelled.');
        if (opts?.deadline !== undefined && Date.now() >= opts.deadline) {
          throw new AIRunStoppedError('The run exceeded its time budget.');
        }
      };

      /** A controller that aborts on timeout, on the caller's signal, and at the deadline. */
      const startCall = (timeout: number) => {
        const controller = new AbortController();
        controllers.add(controller);
        const budget = opts?.deadline === undefined ? timeout : Math.min(timeout, Math.max(0, opts.deadline - Date.now()));
        const timeoutId = setTimeout(() => controller.abort(), budget);
        const onAbort = () => controller.abort();
        opts?.signal?.addEventListener('abort', onAbort);
        return {
          controller,
          done: () => {
            clearTimeout(timeoutId);
            opts?.signal?.removeEventListener('abort', onAbort);
            controllers.delete(controller);
          },
        };
      };

      const recordUsage = (model: string, value?: { inputTokens?: number; outputTokens?: number }) => {
        usage.calls += 1;
        usage.model = model;
        usage.inputTokens += value?.inputTokens ?? 0;
        usage.outputTokens += value?.outputTokens ?? 0;
      };

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
            const call = startCall(timeout);

            try {
              const messages: ModelMessage[] = [];

              if (images && images.length > 0) {
                const userContent: UserContentPart[] = [{ type: 'text', text: prompt }];
                images.forEach((img) => userContent.push({ type: 'image', image: img.url }));
                messages.push({ role: 'user', content: userContent });
              } else {
                messages.push({ role: 'user', content: prompt });
              }

              const result = await generateText({
                model: step.createModel() as never,
                system: opts?.systemMessage?.content,
                messages,
                maxOutputTokens: maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
                maxRetries: 0,
                abortSignal: call.controller.signal,
                providerOptions: step.providerId === 'opencode'
                  ? { opencode: { reasoningEffort: 'none', textVerbosity: 'low' } }
                  : undefined,
              });

              recordUsage(step.model, result.usage);
              const content = result.text || '';
              listeners.forEach((listener) => listener({ type: 'assistant.message', data: { content } }));
              return { data: { content } };
            } catch (err: unknown) {
              checkStopped();
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
              call.done();
            }
          }, listeners, checkStopped);
        },

        async stream({ prompt }: { prompt: string }) {
          return runWithFallbackChain(chain, async (step) => {
            // Only the connection phase is timed; the caller's signal keeps working for the
            // whole stream because the controller stays registered until destroy().
            const controller = new AbortController();
            controllers.add(controller);
            opts?.signal?.addEventListener('abort', () => controller.abort(), { once: true });
            const streamTimeout = setTimeout(() => controller.abort(), 60000);

            try {
              const result = streamText({
                model: step.createModel() as never,
                system: opts?.systemMessage?.content,
                messages: [{ role: 'user', content: prompt }],
                maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
                maxRetries: 0,
                abortSignal: controller.signal,
                onFinish: (event) => recordUsage(step.model, event.usage),
              });
              return result.textStream;
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              throw new Error(message);
            } finally {
              clearTimeout(streamTimeout);
            }
          }, listeners, checkStopped);
        },

        usage() {
          return { ...usage };
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
