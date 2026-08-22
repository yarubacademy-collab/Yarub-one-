import { describe, expect, it } from 'vitest';
import ar from '../apps/web/messages/ar.json';
import ur from '../apps/web/messages/ur.json';
import en from '../apps/web/messages/en.json';

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    value && typeof value === 'object'
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  );
}

/**
 * A missing key does not throw — next-intl renders the key name instead, so a
 * gap shows up as English-looking debris in an Arabic page. This test is the
 * only thing that catches that before a user does.
 */
describe('locale parity', () => {
  const keys = {
    ar: flatten(ar as Record<string, unknown>).sort(),
    ur: flatten(ur as Record<string, unknown>).sort(),
    en: flatten(en as Record<string, unknown>).sort(),
  };

  it('Arabic has exactly the English key set', () => {
    expect(keys.ar).toEqual(keys.en);
  });

  it('Urdu has exactly the English key set', () => {
    expect(keys.ur).toEqual(keys.en);
  });

  it('has no empty translations in any locale', () => {
    for (const [locale, catalog] of Object.entries({ ar, ur, en })) {
      const empties = flatten(catalog as Record<string, unknown>).filter((path) => {
        const value = path.split('.').reduce<unknown>(
          (acc, part) => (acc as Record<string, unknown>)?.[part],
          catalog,
        );
        return typeof value === 'string' && value.trim().length === 0;
      });
      expect(empties, `${locale} has empty strings`).toEqual([]);
    }
  });

  it('translates the free-limit message rather than leaving it English', () => {
    expect((ar as { plan: { limitReached: string } }).plan.limitReached).toMatch(/[\u0600-\u06FF]/);
    expect((ur as { plan: { limitReached: string } }).plan.limitReached).toMatch(/[\u0600-\u06FF]/);
  });

  it('covers every metered action in every locale', () => {
    for (const catalog of [ar, ur, en]) {
      const meter = (catalog as { meter: Record<string, string> }).meter;
      for (const action of ['image', 'video', 'website', 'game', 'document']) {
        expect(meter[action]).toBeTruthy();
      }
    }
  });
});
