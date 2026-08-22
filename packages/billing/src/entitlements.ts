import type { Capability } from '@yarub/shared';

/**
 * Entitlements: what a user is allowed to create, and how much of it.
 *
 * Every value here is data, not code. Limits live in Plan rows so the owner can
 * change pricing and quotas without a deploy — the only thing hard-coded is the
 * shape of a limit, never its number. The FREE defaults below exist solely as
 * the seed values for a fresh install.
 *
 * This module is pure. It makes decisions; it does not read requests, sessions
 * or the database. That is deliberate: quota logic that cannot see a request
 * cannot be talked into trusting one.
 */

/** The things that actually cost money, metered separately from capabilities. */
export const METERED_ACTIONS = ['image', 'video', 'website', 'game', 'document'] as const;
export type MeteredAction = (typeof METERED_ACTIONS)[number];

export interface PlanLimits {
  images: number;
  videos: number;
  /** Hard ceiling per video, enforced on the server before submission. */
  maxVideoSeconds: number;
  websites: number;
  games: number;
  documents: number;
}

export type PlanTier = 'free' | 'premium_monthly' | 'premium_yearly';

export interface PlanDefinition {
  code: PlanTier;
  limits: PlanLimits;
  /** Minor units (e.g. cents/fils). Owner-configured; zero for free. */
  priceMinor: number;
  currency: string;
  intervalDays: number;
}

/**
 * Seed values for a fresh install. Once a Plan row exists it wins — these are
 * never consulted again, which is what makes the limits owner-configurable.
 */
export const DEFAULT_PLANS: Record<PlanTier, PlanDefinition> = {
  free: {
    code: 'free',
    limits: { images: 2, videos: 2, maxVideoSeconds: 10, websites: 1, games: 1, documents: 5 },
    priceMinor: 0,
    currency: 'USD',
    intervalDays: 30,
  },
  premium_monthly: {
    code: 'premium_monthly',
    limits: { images: 200, videos: 30, maxVideoSeconds: 60, websites: 25, games: 25, documents: 200 },
    priceMinor: 0, // Owner sets the real price; zero means "not yet priced".
    currency: 'USD',
    intervalDays: 30,
  },
  premium_yearly: {
    code: 'premium_yearly',
    limits: { images: 3000, videos: 400, maxVideoSeconds: 60, websites: 300, games: 300, documents: 2400 },
    priceMinor: 0,
    currency: 'USD',
    intervalDays: 365,
  },
};

export type SubscriptionStatus = 'active' | 'grace' | 'expired' | 'cancelled';

export interface Subscription {
  planCode: PlanTier;
  status: SubscriptionStatus;
  startedAt: Date;
  /** End of the paid term. */
  expiresAt: Date | null;
  /** Days after expiry during which access continues. */
  graceDays: number;
}

export type UsageCounts = Record<MeteredAction, number>;

export const EMPTY_USAGE: UsageCounts = {
  image: 0,
  video: 0,
  website: 0,
  game: 0,
  document: 0,
};

/** Which limit a metered action draws from. */
const LIMIT_FIELD: Record<MeteredAction, keyof PlanLimits> = {
  image: 'images',
  video: 'videos',
  website: 'websites',
  game: 'games',
  document: 'documents',
};

/**
 * Capability plus artifact type decides the meter.
 *
 * Websites and games both run through `code.generate`, so capability alone
 * cannot tell them apart — the artifact type is what separates the two quotas.
 * Image editing meters as an image so it cannot be used to sidestep the image
 * allowance.
 */
export function meterFor(
  capability: Capability,
  artifactType?: string,
): MeteredAction | undefined {
  if (capability === 'image.generate' || capability === 'image.edit') return 'image';
  if (capability === 'video.textToVideo' || capability === 'video.imageToVideo') return 'video';
  if (capability === 'document.render') return 'document';
  if (capability === 'code.generate') {
    if (artifactType === 'game') return 'game';
    if (artifactType === 'website') return 'website';
  }
  return undefined;
}

/**
 * A subscription that has lapsed falls back to free rather than to nothing:
 * losing access to chat and education because a card expired would be a worse
 * failure than the missed payment.
 */
export function effectivePlan(
  subscription: Subscription | undefined,
  now = new Date(),
): PlanTier {
  if (!subscription) return 'free';
  if (subscription.status === 'expired') return 'free';

  if (subscription.expiresAt) {
    const graceEnd = new Date(
      subscription.expiresAt.getTime() + subscription.graceDays * 86_400_000,
    );
    if (now > graceEnd) return 'free';
    if (now > subscription.expiresAt && subscription.status === 'cancelled') return 'free';
  }

  return subscription.planCode;
}

/** The window quotas reset on. Anchored to the subscription, not the calendar. */
export function currentPeriod(
  subscription: Subscription | undefined,
  intervalDays: number,
  now = new Date(),
): { start: Date; end: Date } {
  const anchor = subscription?.startedAt ?? new Date(0);
  const periodMs = intervalDays * 86_400_000;
  const elapsed = now.getTime() - anchor.getTime();
  const periodsPassed = Math.max(0, Math.floor(elapsed / periodMs));
  const start = new Date(anchor.getTime() + periodsPassed * periodMs);
  return { start, end: new Date(start.getTime() + periodMs) };
}

export interface QuotaDecision {
  allowed: boolean;
  action: MeteredAction;
  used: number;
  limit: number;
  remaining: number;
  reason?: 'quota_exhausted' | 'duration_exceeded';
  /** Server-corrected value when a request asked for more than the plan allows. */
  clampedSeconds?: number;
}

/**
 * The single decision point for expensive work.
 *
 * `requestedSeconds` is clamped rather than merely rejected, so a free user who
 * asks for a 60-second video gets a 10-second one instead of an error — but the
 * clamp happens here, on the server, and the caller must use the returned value.
 */
export function checkQuota(input: {
  action: MeteredAction;
  limits: PlanLimits;
  usage: UsageCounts;
  count?: number;
  requestedSeconds?: number;
}): QuotaDecision {
  const { action, limits, usage } = input;
  const count = input.count ?? 1;
  const limit = limits[LIMIT_FIELD[action]];
  const used = usage[action] ?? 0;
  const remaining = Math.max(0, limit - used);

  const base: QuotaDecision = {
    allowed: used + count <= limit,
    action,
    used,
    limit,
    remaining,
  };

  if (!base.allowed) return { ...base, reason: 'quota_exhausted' };

  if (action === 'video' && input.requestedSeconds !== undefined) {
    const clamped = Math.min(input.requestedSeconds, limits.maxVideoSeconds);
    return { ...base, clampedSeconds: clamped };
  }

  return base;
}

/** Everything the UI needs to show remaining allowance, computed server-side. */
export function allowanceSummary(
  limits: PlanLimits,
  usage: UsageCounts,
): Array<{ action: MeteredAction; used: number; limit: number; remaining: number }> {
  return METERED_ACTIONS.map((action) => {
    const limit = limits[LIMIT_FIELD[action]];
    const used = usage[action] ?? 0;
    return { action, used, limit, remaining: Math.max(0, limit - used) };
  });
}
