import {
  DEFAULT_PLANS,
  EMPTY_USAGE,
  allowanceSummary,
  checkQuota,
  currentPeriod,
  effectivePlan,
  meterFor,
  type MeteredAction,
  type PlanLimits,
  type PlanTier,
  type QuotaDecision,
  type Subscription,
  type UsageCounts,
} from '@yarub/billing';
import { AppError, type Capability } from '@yarub/shared';
import { prisma } from '@yarub/db';

/**
 * The server-side entitlement gate.
 *
 * Everything expensive passes through `enforce` before any provider is called.
 * Nothing here reads a client-supplied limit, quota or plan name — the plan
 * comes from the user's subscription row and the limits come from the Plan
 * table, so a tampered request cannot grant itself an allowance it has not got.
 *
 * Usage is counted from durable records (jobs and usage logs), never from a
 * counter the client could influence.
 */

interface PlanRow {
  id: string;
  code: string;
  intervalDays: number;
  imageQuota: number;
  videoQuota: number;
  maxVideoSeconds: number;
  websiteQuota: number;
  gameQuota: number;
  documentQuota: number;
}

function limitsFrom(plan: PlanRow): PlanLimits {
  return {
    images: plan.imageQuota,
    videos: plan.videoQuota,
    maxVideoSeconds: plan.maxVideoSeconds,
    websites: plan.websiteQuota,
    games: plan.gameQuota,
    documents: plan.documentQuota,
  };
}

/** Falls back to seed values only when the Plan table has not been seeded. */
async function planFor(tier: PlanTier): Promise<{ limits: PlanLimits; intervalDays: number; code: PlanTier }> {
  const row = (await prisma.plan.findFirst({ where: { code: tier, active: true } })) as PlanRow | null;
  if (row) return { limits: limitsFrom(row), intervalDays: row.intervalDays, code: tier };
  const seed = DEFAULT_PLANS[tier];
  return { limits: seed.limits, intervalDays: seed.intervalDays, code: tier };
}

async function subscriptionFor(userId: string): Promise<Subscription | undefined> {
  const row = await prisma.subscription.findFirst({
    where: { userId, status: { in: ['active', 'grace', 'cancelled'] } },
    orderBy: { createdAt: 'desc' },
    include: { plan: true },
  });
  if (!row) return undefined;

  return {
    planCode: row.plan.code as PlanTier,
    status: row.status as Subscription['status'],
    startedAt: row.startedAt,
    expiresAt: row.expiresAt,
    graceDays: row.graceDays,
  };
}

/**
 * Usage counted from what was actually produced.
 *
 * Images, videos and documents come from UsageLog; websites and games are
 * counted as completed jobs of that artifact type, because a bundle is one
 * creation regardless of how many code steps produced it.
 */
async function usageFor(userId: string, start: Date, end: Date): Promise<UsageCounts> {
  const [logs, jobs] = await Promise.all([
    prisma.usageLog.findMany({
      where: { userId, at: { gte: start, lt: end } },
      select: { capability: true },
    }),
    prisma.job.findMany({
      where: {
        project: { userId },
        createdAt: { gte: start, lt: end },
        status: { in: ['queued', 'running', 'succeeded'] },
        type: { in: ['website', 'game'] },
      },
      select: { type: true },
    }),
  ]);

  const usage: UsageCounts = { ...EMPTY_USAGE };

  for (const row of logs as Array<{ capability: string }>) {
    const action = meterFor(row.capability as Capability);
    if (action === 'image' || action === 'video' || action === 'document') {
      usage[action] += 1;
    }
  }

  for (const job of jobs as Array<{ type: string }>) {
    if (job.type === 'website') usage.website += 1;
    if (job.type === 'game') usage.game += 1;
  }

  return usage;
}

export interface Entitlements {
  planCode: PlanTier;
  limits: PlanLimits;
  usage: UsageCounts;
  period: { start: Date; end: Date };
  allowance: ReturnType<typeof allowanceSummary>;
}

export async function resolveEntitlements(userId: string, now = new Date()): Promise<Entitlements> {
  const subscription = await subscriptionFor(userId);
  const tier = effectivePlan(subscription, now);
  const plan = await planFor(tier);
  const period = currentPeriod(subscription, plan.intervalDays, now);
  const usage = await usageFor(userId, period.start, period.end);

  return {
    planCode: tier,
    limits: plan.limits,
    usage,
    period,
    allowance: allowanceSummary(plan.limits, usage),
  };
}

export class QuotaExceededError extends AppError {
  constructor(
    readonly decision: QuotaDecision,
    readonly planCode: PlanTier,
  ) {
    super(
      'RATE_LIMITED',
      `Quota exhausted for ${decision.action}: ${decision.used}/${decision.limit} on ${planCode}`,
      undefined,
    );
  }
}

/**
 * Call before starting any expensive work.
 *
 * Returns the server's own decision, including a clamped duration. Callers must
 * use `clampedSeconds` rather than whatever the client asked for — that is the
 * whole mechanism preventing a free user from requesting a 60-second render.
 */
export async function enforce(input: {
  userId: string;
  capability: Capability;
  artifactType?: string;
  count?: number;
  requestedSeconds?: number;
}): Promise<{ decision: QuotaDecision | undefined; entitlements: Entitlements }> {
  const entitlements = await resolveEntitlements(input.userId);
  const action = meterFor(input.capability, input.artifactType);

  // Chat, reasoning, translation and education are not metered: a free user
  // keeps full study access. Only creation draws down an allowance.
  if (!action) return { decision: undefined, entitlements };

  const decision = checkQuota({
    action,
    limits: entitlements.limits,
    usage: entitlements.usage,
    ...(input.count !== undefined ? { count: input.count } : {}),
    ...(input.requestedSeconds !== undefined ? { requestedSeconds: input.requestedSeconds } : {}),
  });

  if (!decision.allowed) throw new QuotaExceededError(decision, entitlements.planCode);

  return { decision, entitlements };
}

/**
 * Pre-flight check for a whole plan, run before a job is queued so a user is
 * told up front rather than after several steps have already been paid for.
 */
export async function enforcePlan(input: {
  userId: string;
  artifactType: string;
  capabilities: Capability[];
}): Promise<Entitlements> {
  const counts = new Map<MeteredAction, number>();

  for (const capability of input.capabilities) {
    const action = meterFor(capability, input.artifactType);
    if (action) counts.set(action, (counts.get(action) ?? 0) + 1);
  }

  const entitlements = await resolveEntitlements(input.userId);

  for (const [action, count] of counts) {
    const decision = checkQuota({
      action,
      limits: entitlements.limits,
      usage: entitlements.usage,
      count,
    });
    if (!decision.allowed) throw new QuotaExceededError(decision, entitlements.planCode);
  }

  return entitlements;
}
