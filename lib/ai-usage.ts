/** Token accounting and the shared time budget for AI runs. No server dependencies. */

export type AIUsage = { inputTokens: number; outputTokens: number; calls: number; model?: string };

/**
 * Time a run may spend on model calls. Kept under the routes' 300s maxDuration so there is room to
 * save the result and close the run; without it, fallbacks and repairs could chain to ~900s and
 * the platform killed the request with the run still "running".
 */
export const RUN_BUDGET_MS = 240_000;

/** Sum the usage of several sessions. */
export function sumUsage(...parts: Array<AIUsage | undefined>): AIUsage {
  return parts.reduce<AIUsage>((total, part) => ({
    inputTokens: total.inputTokens + (part?.inputTokens ?? 0),
    outputTokens: total.outputTokens + (part?.outputTokens ?? 0),
    calls: total.calls + (part?.calls ?? 0),
    model: part?.model ?? total.model,
  }), { inputTokens: 0, outputTokens: 0, calls: 0 });
}
