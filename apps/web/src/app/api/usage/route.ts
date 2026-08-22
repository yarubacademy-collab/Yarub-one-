import { computeBalance, spendByCapability } from '@yarub/billing';
import type { Capability } from '@yarub/shared';
import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { requireUserId } from '../../../lib/session';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

/**
 * Usage and credit balance for the signed-in user.
 *
 * The balance is derived on read from grants and UsageLog rather than stored,
 * so it cannot disagree with what was actually spent. There is no payment
 * integration behind this — it reports real consumption only.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    const config = loadConfig();

    const [grants, usage] = await Promise.all([
      prisma.creditGrant.findMany({ where: { userId } }),
      prisma.usageLog.findMany({
        where: { userId },
        select: { capability: true, units: true, at: true },
        orderBy: { at: 'desc' },
        take: 5000,
      }),
    ]);

    const debits = usage.map((row: { capability: string; units: number; at: Date }) => ({
      capability: row.capability as Capability,
      units: row.units,
      at: row.at,
    }));

    const balance = computeBalance(
      grants.map((g: { credits: unknown; createdAt: Date; expiresAt: Date | null }) => ({
        credits: Number(g.credits),
        createdAt: g.createdAt,
        expiresAt: g.expiresAt,
      })),
      debits,
    );

    return Response.json({
      creditsEnabled: config.CREDITS_ENABLED,
      balance,
      breakdown: spendByCapability(debits),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
