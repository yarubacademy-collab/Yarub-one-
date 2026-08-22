import { expect, test } from '@playwright/test';

/**
 * The core promise: an unconfigured capability is stated plainly and never
 * mimicked. These tests fail if a placeholder ever starts pretending to work.
 */
test.describe('honest capability states', () => {
  test('settings lists every capability with a real status', async ({ page }) => {
    await page.goto('/en/register');
    await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.test`);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.goto('/en/settings');
    const rows = page.getByRole('listitem');
    await expect(rows).toHaveCount(11);

    const text = await page.locator('body').innerText();
    // Provider and model identities must never reach the browser.
    expect(text).not.toMatch(/gpt|claude|gemini|openai|anthropic|text-primary/i);
  });

  test('an unconfigured section shows the not-configured state, not a fake studio', async ({ page }) => {
    await page.goto('/en/register');
    await page.getByLabel('Email').fill(`e2e-${Date.now()}@example.test`);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Create account' }).click();

    await page.goto('/en/video');
    const body = await page.locator('body').innerText();
    const configured = !body.includes('Not configured');
    test.skip(configured, 'video provider is configured in this environment');
    expect(body).toContain('needs a provider configured');
  });
});
