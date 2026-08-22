import { expect, test } from '@playwright/test';

const password = 'correct-horse-battery';

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
}

test.describe('authentication and ownership', () => {
  test('a user can register and reach the console', async ({ page }) => {
    await page.goto('/en/register');
    await page.getByLabel('Email').fill(uniqueEmail());
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/en\/create/);
  });

  test('an anonymous request to a protected API is rejected', async ({ request }) => {
    const res = await request.get('/api/capabilities');
    expect(res.status()).toBe(401);
  });

  test("one user cannot read another user's project", async ({ browser }) => {
    const owner = await browser.newContext();
    const ownerPage = await owner.newPage();
    await ownerPage.goto('/en/register');
    await ownerPage.getByLabel('Email').fill(uniqueEmail());
    await ownerPage.getByLabel('Password').fill(password);
    await ownerPage.getByRole('button', { name: 'Create account' }).click();

    const created = await ownerPage.request.post('/api/jobs', {
      data: { request: 'Create a small website about water', locale: 'en' },
    });
    const body = await created.json();
    test.skip(!body.projectId, 'requires a configured text provider');

    const stranger = await browser.newContext();
    const strangerPage = await stranger.newPage();
    await strangerPage.goto('/en/register');
    await strangerPage.getByLabel('Email').fill(uniqueEmail());
    await strangerPage.getByLabel('Password').fill(password);
    await strangerPage.getByRole('button', { name: 'Create account' }).click();

    const response = await strangerPage.goto(`/en/projects/${body.projectId}`);
    expect(response?.status()).toBe(404);
  });
});
