import { expect, test } from '@playwright/test';

/**
 * Direction and typography are product requirements here, not polish: a
 * mirrored rail or a collapsed Nastaliq line-height makes the app unusable
 * for its primary audience.
 */
test.describe('multilingual layout', () => {
  for (const { locale, dir } of [
    { locale: 'ar', dir: 'rtl' },
    { locale: 'ur', dir: 'rtl' },
    { locale: 'en', dir: 'ltr' },
  ]) {
    test(`${locale} renders with dir=${dir}`, async ({ page }) => {
      await page.goto(`/${locale}/create`);
      await expect(page.locator('html')).toHaveAttribute('dir', dir);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
    });
  }

  test('navigation rail sits on the correct edge in Arabic', async ({ page }) => {
    await page.goto('/ar/create');
    const nav = page.locator('nav').first();
    const navBox = await nav.boundingBox();
    const viewport = page.viewportSize();
    if (!navBox || !viewport) test.skip();
    // In RTL the rail should occupy the right half of the viewport edge.
    expect(navBox!.x).toBeGreaterThan(viewport!.width / 2);
  });

  test('Urdu uses a taller line-height than Arabic', async ({ page }) => {
    const heights: Record<string, number> = {};
    for (const locale of ['ar', 'ur']) {
      await page.goto(`/${locale}/create`);
      heights[locale] = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.body).lineHeight),
      );
    }
    expect(heights.ur).toBeGreaterThan(heights.ar);
  });

  test('no untranslated message keys leak into the page', async ({ page }) => {
    for (const locale of ['ar', 'ur', 'en']) {
      await page.goto(`/${locale}/create`);
      const body = await page.locator('body').innerText();
      expect(body).not.toMatch(/nav\.|create\.|capability\./);
    }
  });
});
