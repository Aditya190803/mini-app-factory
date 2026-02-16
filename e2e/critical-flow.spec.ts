import { expect, test } from '@playwright/test';

const hasAuth = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

test.describe('Critical project flow (auth required)', () => {
  test.skip(!hasAuth, 'Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated critical flow tests.');

  test('project creation entry path is accessible for authenticated users', async ({ page }) => {
    await page.goto('/');

    await page.getByPlaceholder('e.g. neuro-pulse-v1').fill(`pw-${Date.now()}`);
    await page.getByPlaceholder('Enter detailed architectural requirements...').fill('Create a one-page website with hero, features, testimonials, and contact form.');

    await page.getByRole('button', { name: /initialize fabrication/i }).click();

    await expect(page).not.toHaveURL(/\/handler\/sign-in/);
  });
});
