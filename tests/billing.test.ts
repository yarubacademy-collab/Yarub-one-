import { describe, expect, it } from 'vitest';
import {
  CREDIT_RATES,
  canAfford,
  computeBalance,
  creditsFor,
  spendByCapability,
} from '../packages/billing/src/index';
import { CAPABILITIES } from '../packages/shared/src/capability';

const day = (n: number) => new Date(2026, 0, n);

describe('credit rates', () => {
  it('covers every capability', () => {
    for (const capability of CAPABILITIES) {
      expect(CREDIT_RATES[capability]).toBeDefined();
    }
  });

  it('charges nothing for locally-rendered documents', () => {
    expect(creditsFor('document.render', 10)).toBe(0);
  });

  it('prices video far above text', () => {
    expect(creditsFor('video.textToVideo', 1)).toBeGreaterThan(creditsFor('text.reason', 1000));
  });

  it('rejects negative units', () => {
    expect(() => creditsFor('image.generate', -1)).toThrow();
  });
});

describe('balance', () => {
  it('is granted minus spent', () => {
    const balance = computeBalance(
      [{ credits: 100, createdAt: day(1) }],
      [{ capability: 'image.generate', units: 5, at: day(2) }],
      day(3),
    );
    expect(balance.granted).toBe(100);
    expect(balance.spent).toBe(20);
    expect(balance.remaining).toBe(80);
  });

  it('reports expired grants separately rather than hiding them', () => {
    const balance = computeBalance(
      [
        { credits: 50, createdAt: day(1), expiresAt: day(2) },
        { credits: 30, createdAt: day(1) },
      ],
      [],
      day(5),
    );
    expect(balance.expired).toBe(50);
    expect(balance.granted).toBe(30);
    expect(balance.remaining).toBe(30);
  });

  it('goes negative rather than clamping, so overdraft is visible', () => {
    const balance = computeBalance(
      [{ credits: 10, createdAt: day(1) }],
      [{ capability: 'video.textToVideo', units: 1, at: day(2) }],
      day(3),
    );
    expect(balance.remaining).toBeLessThan(0);
  });

  it('treats a correction as a negative grant', () => {
    const balance = computeBalance(
      [
        { credits: 100, createdAt: day(1) },
        { credits: -40, createdAt: day(2) },
      ],
      [],
      day(3),
    );
    expect(balance.remaining).toBe(60);
  });

  it('starts at zero with no grants', () => {
    expect(computeBalance([], []).remaining).toBe(0);
  });
});

describe('affordability', () => {
  const balance = computeBalance([{ credits: 60, createdAt: day(1) }], [], day(2));

  it('permits what the balance covers', () => {
    expect(canAfford(balance, 'video.textToVideo', 1)).toBe(true);
  });

  it('refuses a render that would overdraw before it starts', () => {
    expect(canAfford(balance, 'video.textToVideo', 2)).toBe(false);
  });

  it('always permits a zero-cost capability', () => {
    const empty = computeBalance([], []);
    expect(canAfford(empty, 'document.render', 100)).toBe(true);
  });
});

describe('breakdown', () => {
  it('groups spend by capability, largest first', () => {
    const rows = spendByCapability([
      { capability: 'text.reason', units: 1000, at: day(1) },
      { capability: 'image.generate', units: 3, at: day(1) },
      { capability: 'image.generate', units: 2, at: day(2) },
    ]);
    expect(rows[0].capability).toBe('image.generate');
    expect(rows[0].units).toBe(5);
    expect(rows[0].credits).toBe(20);
  });

  it('returns nothing for no usage', () => {
    expect(spendByCapability([])).toEqual([]);
  });
});
