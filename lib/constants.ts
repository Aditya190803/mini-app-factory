import { DEFAULT_PROVIDER_MODELS } from './ai-admin-config';

/** The default AI model, sourced from env or the admin config defaults. */
export const DEFAULT_MODEL =
  process.env.GOOGLE_MODEL || DEFAULT_PROVIDER_MODELS.google;

/** Design spec cache TTL in milliseconds (15 minutes). */
export const DESIGN_SPEC_CACHE_TTL_MS = 1000 * 60 * 15;

/** Maximum route handler duration in seconds. */
export const MAX_ROUTE_DURATION = 300;

/** AI message send timeout in milliseconds. */
export const AI_MESSAGE_TIMEOUT_MS = 120_000;

/** Max entries in the in-memory rate-limit store before pruning. */
export const MAX_RATE_LIMIT_ENTRIES = 10_000;

/** Max entries in the site-builder job store. */
export const MAX_JOB_STORE_SIZE = 1_000;

/** Maximum undo history entries before oldest are dropped. */
export const MAX_HISTORY_ENTRIES = 50;
