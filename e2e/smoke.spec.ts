import { expect, test } from '@playwright/test';

test('the landing page renders its composer and the static/edge explainer', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toBeVisible();
  await expect(page.getByText('Edge', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Database app \(D1\)/ })).toBeVisible();
});

test('public pages load without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const path of ['/docs', '/about', '/privacy', '/support']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
  }
  expect(errors).toEqual([]);
});

test('health and readiness endpoints answer', async ({ request }) => {
  expect((await request.get('/api/health')).ok()).toBe(true);
  // Readiness reports per-check results; with placeholder env Convex is unreachable, so 503.
  const ready = await request.get('/api/health/ready');
  expect([200, 503]).toContain(ready.status());
  expect(await ready.json()).toHaveProperty('checks');
});

test('robots keeps crawlers off user content and private surfaces', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  for (const path of ['/results/', '/preview/', '/edit/', '/api/']) expect(robots).toContain(`Disallow: ${path}`);
});

test('API routes refuse anonymous callers', async ({ request }) => {
  for (const [method, path] of [['POST', '/api/generate'], ['POST', '/api/transform'], ['POST', '/api/deploy'], ['GET', '/api/ai/status']] as const) {
    const response = await request.fetch(path, { method, data: method === 'POST' ? { projectName: 'x', prompt: 'y' } : undefined });
    expect([400, 401], `${method} ${path}`).toContain(response.status());
  }
});

test('the editor sends security headers', async ({ request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
});
