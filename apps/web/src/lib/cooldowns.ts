import { meterFor, type MeteredAction, type PlanLimits, type PlanTier } from '@yarub/billing';
import { AppError, type Capability } from '@yarub/shared';
import { prisma } from '@yarub/db';

/**
 * Pauses between creations, on top of the per-period quota.
 *
 * A quota says how much a user may make in a period; a cooldown says how fast.
 * Chat is never affected — only the five metered creation actions are.
 *
 * Like the quota, this is derived from durable records (usage logs and jobs),
 * never from anything the client sends, so it cannot be tampered with.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

interface CooldownRule {
  /** A pause begins after every this-many creations inside `windowMs`. */
  every: number;
  /** How long the pause lasts, counted from the most recent creation. */
  pauseMs: number;
  /** How far back creations are counted. */
  windowMs: number;
}

/**
 * Free plan: fixed pauses.
 *
 * Videos wait 2 days after each one; websites and games wait 10 days after
 * each one (and once the period's quota is used up, the ordinary quota limit
 * holds until the period ends); documents pause 5 hours after every third one
 * in a day. Images have no pause on the free plan — only their quota.
 */
const FREE_RULES: Partial<Record<MeteredAction, CooldownRule>> = {
  video: { every: 1, pauseMs: 2 * DAY, windowMs: 2 * DAY },
  website: { every: 1, pauseMs: 10 * DAY, windowMs: 10 * DAY },
  game: { every: 1, pauseMs: 10 * DAY, windowMs: 10 * DAY },
  document: { every: 3, pauseMs: 5 * HOUR, windowMs: DAY },
};

/**
 * Paid plans (monthly or yearly): a burst throttle.
 *
 * Creating 10% of the period's quota in one sitting pauses that action for
 * 4 hours. The share is taken from the plan's own quota, so it scales with
 * whatever the admin sets — 10 websites means a pause after every 1, 100
 * images means a pause after every 10.
 */
const PAID_BURST_SHARE = 0.1;
const PAID_PAUSE_MS = 4 * HOUR;

const LIMIT_KEY: Record<MeteredAction, keyof PlanLimits> = {
  image: 'images',
  video: 'videos',
  website: 'websites',
  game: 'games',
  document: 'documents',
};

function ruleFor(
  planCode: PlanTier,
  action: MeteredAction,
  limits: PlanLimits,
): CooldownRule | undefined {
  if (planCode === 'free') return FREE_RULES[action];

  const quota = limits[LIMIT_KEY[action]];
  if (quota <= 0) return undefined;

  return {
    every: Math.max(1, Math.ceil(quota * PAID_BURST_SHARE)),
    pauseMs: PAID_PAUSE_MS,
    windowMs: PAID_PAUSE_MS,
  };
}

/**
 * When each recent creation happened.
 *
 * Websites and games are counted as jobs, the same way the quota counts them;
 * images, videos and documents come from the usage log. Failed jobs do not
 * count, so a failure never locks a user out.
 */
async function creationTimes(userId: string, action: MeteredAction, since: Date): Promise<Date[]> {
  if (action === 'website' || action === 'game') {
    const jobs = await prisma.job.findMany({
      where: {
        project: { userId },
        createdAt: { gte: since },
        status: { in: ['queued', 'running', 'succeeded'] },
        type: { in: [action] },
      },
      select: { createdAt: true },
    });
    return (jobs as Array<{ createdAt: Date }>).map((job) => job.createdAt);
  }

  const logs = await prisma.usageLog.findMany({
    where: { userId, at: { gte: since } },
    select: { capability: true, at: true },
  });

  return (logs as Array<{ capability: string; at: Date }>)
    .filter((row) => meterFor(row.capability as Capability) === action)
    .map((row) => row.at);
}

export class CooldownError extends AppError {
  constructor(
    readonly action: MeteredAction,
    readonly retryAfterSeconds: number,
    readonly planCode: PlanTier,
  ) {
    super(
      'RATE_LIMITED',
      `Cooldown for ${action}: ${retryAfterSeconds}s remaining on ${planCode}`,
      undefined,
    );
  }
}

/** Throws `CooldownError` if this action is currently paused for the user. */
export async function assertNotCoolingDown(input: {
  userId: string;
  action: MeteredAction;
  planCode: PlanTier;
  limits: PlanLimits;
  now?: Date;
}): Promise<void> {
  // Testing only: lets the owner try the same thing repeatedly instead of waiting
  // out a pause meant for customers. Never set this on a live, paying site.
  if (process.env.DISABLE_COOLDOWNS === '1') return;

  const rule = ruleFor(input.planCode, input.action, input.limits);
  if (!rule) return;

  const now = input.now ?? new Date();
  const windowMs = Math.max(rule.windowMs, rule.pauseMs);
  const times = await creationTimes(input.userId, input.action, new Date(now.getTime() - windowMs));

  if (times.length === 0 || times.length % rule.every !== 0) return;

  const latest = Math.max(...times.map((time) => time.getTime()));
  const readyAt = latest + rule.pauseMs;

  if (readyAt > now.getTime()) {
    throw new CooldownError(
      input.action,
      Math.ceil((readyAt - now.getTime()) / 1000),
      input.planCode,
    );
  }
}
