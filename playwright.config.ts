import { defineConfig } from '@playwright/test';

/**
 * Smoke tests against a production build. They cover what runs without live Stack Auth and
 * Convex backends: public pages, health, SEO files and security headers. Flows behind sign-in
 * are covered by the route and Convex tests under __tests__.
 *
 *   bun run build && bun run test:e2e
 *
 * PW_CHANNEL=msedge (or chrome) uses an installed browser instead of Playwright's download.
 */
const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: `bun run start -- --port ${port}`,
    url: `http://localhost:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
