import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLANS,
  EMPTY_USAGE,
  allowanceSummary,
  checkQuota,
  currentPeriod,
  effectivePlan,
  meterFor,
  type Subscription,
} from '../packages/billing/src/entitlements';

const FREE = DEFAULT_PLANS.free.limits;
const day = (n: number) => new Date(2026, 0, n);

describe('metering', () => {
  it('meters image editing against the image quota', () => {
    // Otherwise editing would be a free path around the image allowance.
    expect(meterFor('image.edit')).toBe('image');
    expect(meterFor('image.generate')).toBe('image');
  });

  it('separates website and game quotas despite one shared capability', () => {
    expect(meterFor('code.generate', 'website')).toBe('website');
    expect(meterFor('code.generate', 'game')).toBe('game');
  });

  it('does not meter chat or reasoning', () => {
    expect(meterFor('text.generate')).toBeUndefined();
    expect(meterFor('text.reason')).toBeUndefined();
  });
});

describe('free plan limits', () => {
  it('matches the specified free allowances', () => {
    expect(FREE.images).toBe(2);
    expect(FREE.videos).toBe(2);
    expect(FREE.maxVideoSeconds).toBe(10);
    expect(FREE.websites).toBe(1);
    expect(FREE.games).toBe(1);
  });

  it('permits the second image and refuses the third', () => {
    expect(checkQuota({ action: 'image', limits: FREE, usage: { ...EMPTY_USAGE, image: 1 } }).allowed).toBe(true);
    const denied = checkQuota({ action: 'image', limits: FREE, usage: { ...EMPTY_USAGE, image: 2 } });
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('quota_exhausted');
    expect(denied.remaining).toBe(0);
  });

  it('refuses a second website', () => {
    expect(checkQuota({ action: 'website', limits: FREE, usage: { ...EMPTY_USAGE, website: 1 } }).allowed).toBe(false);
  });

  it('refuses a second game', () => {
    expect(checkQuota({ action: 'game', limits: FREE, usage: { ...EMPTY_USAGE, game: 1 } }).allowed).toBe(false);
  });

  it('refuses a batch that would exceed the remaining allowance', () => {
    const decision = checkQuota({ action: 'image', limits: FREE, usage: { ...EMPTY_USAGE, image: 1 }, count: 2 });
    expect(decision.allowed).toBe(false);
  });
});

describe('video duration enforcement', () => {
  it('clamps a free request of 60 seconds down to 10', () => {
    const decision = checkQuota({ action: 'video', limits: FREE, usage: EMPTY_USAGE, requestedSeconds: 60 });
    expect(decision.allowed).toBe(true);
    expect(decision.clampedSeconds).toBe(10);
  });

  it('clamps an absurd client-supplied value', () => {
    // A tampered frontend cannot buy a longer render by asking for one.
    const decision = checkQuota({ action: 'video', limits: FREE, usage: EMPTY_USAGE, requestedSeconds: 99_999 });
    expect(decision.clampedSeconds).toBe(10);
  });

  it('leaves a request under the ceiling untouched', () => {
    const decision = checkQuota({ action: 'video', limits: FREE, usage: EMPTY_USAGE, requestedSeconds: 5 });
    expect(decision.clampedSeconds).toBe(5);
  });

  it('allows premium a longer ceiling from configuration', () => {
    const decision = checkQuota({
      action: 'video',
      limits: DEFAULT_PLANS.premium_monthly.limits,
      usage: EMPTY_USAGE,
      requestedSeconds: 45,
    });
    expect(decision.clampedSeconds).toBe(45);
  });

  it('refuses beyond the video count even when duration is fine', () => {
    const decision = checkQuota({
      action: 'video', limits: FREE, usage: { ...EMPTY_USAGE, video: 2 }, requestedSeconds: 5,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.clampedSeconds).toBeUndefined();
  });
});

describe('subscription resolution', () => {
  const base: Subscription = {
    planCode: 'premium_monthly',
    status: 'active',
    startedAt: day(1),
    expiresAt: day(31),
    graceDays: 3,
  };

  it('treats no subscription as free', () => {
    expect(effectivePlan(undefined)).toBe('free');
  });

  it('keeps premium inside the paid term', () => {
    expect(effectivePlan(base, day(15))).toBe('premium_monthly');
  });

  it('keeps premium during the grace period', () => {
    expect(effectivePlan(base, new Date(2026, 1, 2))).toBe('premium_monthly');
  });

  it('falls back to free after grace, not to no access at all', () => {
    expect(effectivePlan(base, new Date(2026, 1, 20))).toBe('free');
  });

  it('drops a cancelled plan at term end without grace', () => {
    const cancelled = { ...base, status: 'cancelled' as const };
    expect(effectivePlan(cancelled, new Date(2026, 1, 1))).toBe('free');
  });

  it('treats an explicitly expired subscription as free immediately', () => {
    expect(effectivePlan({ ...base, status: 'expired' }, day(2))).toBe('free');
  });
});

describe('quota period', () => {
  it('anchors to the subscription start, not the calendar month', () => {
    const sub: Subscription = {
      planCode: 'premium_monthly', status: 'active',
      startedAt: day(10), expiresAt: null, graceDays: 0,
    };
    const period = currentPeriod(sub, 30, day(15));
    expect(period.start.getTime()).toBe(day(10).getTime());
  });

  it('rolls forward once the interval elapses', () => {
    const sub: Subscription = {
      planCode: 'free', status: 'active',
      startedAt: day(1), expiresAt: null, graceDays: 0,
    };
    const period = currentPeriod(sub, 30, new Date(2026, 1, 5));
    expect(period.start.getTime()).toBeGreaterThan(day(1).getTime());
  });
});

describe('allowance summary', () => {
  it('reports remaining for every metered action', () => {
    const rows = allowanceSummary(FREE, { ...EMPTY_USAGE, image: 1 });
    const images = rows.find((r) => r.action === 'image')!;
    expect(images.remaining).toBe(1);
    expect(images.limit).toBe(2);
    expect(rows).toHaveLength(5);
  });

  it('never reports negative remaining', () => {
    const rows = allowanceSummary(FREE, { ...EMPTY_USAGE, image: 9 });
    expect(rows.find((r) => r.action === 'image')!.remaining).toBe(0);
  });
});
