import { expect, test } from '@playwright/test';

test.describe('Public smoke flows', () => {
  test('home page renders core controls', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Mini App Factory' })).toBeVisible();
    await expect(page.getByPlaceholder('e.g. neuro-pulse-v1')).toBeVisible();
    await expect(page.getByPlaceholder('Enter detailed architectural requirements...')).toBeVisible();
  });

  test('signed-out start redirects to sign-in', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder('e.g. neuro-pulse-v1').fill('playwright-demo');
    await page.getByPlaceholder('Enter detailed architectural requirements...').fill('Build a clean SaaS landing page with hero, pricing, and FAQ sections.');

    await page.getByRole('button', { name: /initialize fabrication/i }).click();
    await expect(page).toHaveURL(/\/handler\/sign-in/);
  });

  test('docs page is reachable', async ({ page }) => {
    await page.goto('/docs');
    await expect(page.getByRole('main')).toBeVisible();
  });
});
