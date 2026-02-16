// This file configures the initialization of Sentry on the client.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  'https://19e79bae350ff79d99c2cbb32968f2de@o4509688431247360.ingest.de.sentry.io/4510894724874320';

Sentry.init({
  dsn: SENTRY_DSN,
  enabled: !!SENTRY_DSN,

  integrations: [Sentry.replayIntegration()],

  // Performance — lower sample rate in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  // Session Replay
  replaysSessionSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,
  sendDefaultPii: true,

  // Filter out noisy browser errors
  ignoreErrors: [
    'ResizeObserver loop',
    'Network request failed',
    'AbortError',
    'TypeError: cancelled',
    'TypeError: Failed to fetch',
  ],
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
