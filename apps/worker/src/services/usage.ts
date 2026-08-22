import { prisma } from '@yarub/db';
import { AppError, type Capability } from '@yarub/shared';
import { canAfford, computeBalance } from '@yarub/billing';

/**
 * Cost control from day one.
 *
 * Video is orders of magnitude more expensive than text, so it is metered in
 * seconds against its own daily ceiling rather than sharing a generic quota.
 */

export interface Quotas {
  jobsPerDay: number;
  imagesPerDay: number;
  videoSecondsPerDay: number;
}

/** Rough per-unit cost hints, used for estimates shown to the owner, not billing. */
const UNIT_COST: Partial<Record<Capability, number>> = {
  'text.generate': 0.000002,
  'text.reason': 0.000008,
  'image.generate': 0.04,
  'image.edit': 0.04,
  'video.textToVideo': 0.5,
  'video.imageToVideo': 0.5,
  'speech.tts': 0.00002,
  'speech.stt': 0.0001,
};

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function recordUsage(input: {
  userId: string;
  jobId?: string;
  capability: Capability;
  providerId: string;
  units: number;
}): Promise<void> {
  await prisma.usageLog.create({
    data: {
      userId: input.userId,
      jobId: input.jobId ?? null,
      capability: input.capability,
      providerId: input.providerId,
      units: input.units,
      costEstimate: (UNIT_COST[input.capability] ?? 0) * input.units,
    },
  });
}

export async function assertWithinQuota(
  userId: string,
  capability: Capability,
  requestedUnits: number,
  quotas: Quotas,
): Promise<void> {
  const since = startOfToday();

  if (capability === 'video.textToVideo' || capability === 'video.imageToVideo') {
    const used = await prisma.usageLog.aggregate({
      where: { userId, at: { gte: since }, capability: { in: ['video.textToVideo', 'video.imageToVideo'] } },
      _sum: { units: true },
    });
    if ((used._sum.units ?? 0) + requestedUnits > quotas.videoSecondsPerDay) {
      throw new AppError(
        'RATE_LIMITED',
        'Daily video quota exhausted',
        'آج کی ویڈیو حد ختم ہو چکی ہے۔ کل دوبارہ کوشش کریں۔',
      );
    }
    return;
  }

  if (capability === 'image.generate' || capability === 'image.edit') {
    const used = await prisma.usageLog.aggregate({
      where: { userId, at: { gte: since }, capability: { in: ['image.generate', 'image.edit'] } },
      _sum: { units: true },
    });
    if ((used._sum.units ?? 0) + requestedUnits > quotas.imagesPerDay) {
      throw new AppError(
        'RATE_LIMITED',
        'Daily image quota exhausted',
        'آج کی تصاویر کی حد ختم ہو چکی ہے۔',
      );
    }
  }
}

export async function assertJobQuota(userId: string, quotas: Quotas): Promise<void> {
  const count = await prisma.job.count({
    where: { project: { userId }, createdAt: { gte: startOfToday() } },
  });
  if (count >= quotas.jobsPerDay) {
    throw new AppError('RATE_LIMITED', 'Daily job quota exhausted', 'آج کی حد ختم ہو چکی ہے۔');
  }
}

/**
 * Credit enforcement.
 *
 * Balance is recomputed from grants and UsageLog every time rather than cached,
 * so it can never drift from what was actually spent. Enforcement is optional:
 * a self-hosted single-user install should not be gated by an accounting
 * system it does not need, so this is a no-op unless CREDITS_ENABLED is set.
 */
export async function assertSufficientCredits(
  userId: string,
  capability: Capability,
  units: number,
  enabled: boolean,
): Promise<void> {
  if (!enabled) return;

  const [grants, debits] = await Promise.all([
    prisma.creditGrant.findMany({ where: { userId } }),
    prisma.usageLog.findMany({ where: { userId }, select: { capability: true, units: true, at: true } }),
  ]);

  const balance = computeBalance(
    grants.map((g: { credits: unknown; createdAt: Date; expiresAt: Date | null }) => ({
      credits: Number(g.credits),
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
    })),
    debits.map((d: { capability: string; units: number; at: Date }) => ({
      capability: d.capability as Capability,
      units: d.units,
      at: d.at,
    })),
  );

  if (!canAfford(balance, capability, units)) {
    throw new AppError(
      'RATE_LIMITED',
      `Insufficient credits: need ${units} units of ${capability}, remaining ${balance.remaining}`,
      'آپ کے credits ختم ہو چکے ہیں۔',
    );
  }
}
