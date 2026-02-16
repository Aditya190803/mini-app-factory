/**
 * Structured logger – thin wrapper around console.
 *
 * - **production**: emits JSON lines (easy to ingest by log drains)
 * - **development**: human-readable with level labels
 * - **test**: silent by default (override with LOG_LEVEL=debug)
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isTest = process.env.NODE_ENV === "test" || process.env.VITEST === "true";
const isProd = process.env.NODE_ENV === "production";

const minLevel: LogLevel =
  (process.env.LOG_LEVEL as LogLevel | undefined) ??
  (isTest ? "error" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[minLevel];
}

function formatMessage(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): string | object {
  if (isProd) {
    return JSON.stringify({ level, msg: message, ts: Date.now(), ...meta });
  }
  const prefix = `[${level.toUpperCase()}]`;
  if (meta && Object.keys(meta).length > 0) {
    return `${prefix} ${message} ${JSON.stringify(meta)}`;
  }
  return `${prefix} ${message}`;
}

function log(
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>,
): void {
  if (!shouldLog(level)) return;
  const formatted = formatMessage(level, message, meta);
  switch (level) {
    case "debug":
      console.debug(formatted);
      break;
    case "info":
      console.info(formatted);
      break;
    case "warn":
      console.warn(formatted);
      break;
    case "error":
      console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) =>
    log("debug", msg, meta),
  info: (msg: string, meta?: Record<string, unknown>) =>
    log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) =>
    log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) =>
    log("error", msg, meta),
};
