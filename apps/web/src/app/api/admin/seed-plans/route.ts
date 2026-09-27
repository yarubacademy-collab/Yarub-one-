import { prisma } from '@yarub/db';
import { requireAdmin } from '../../../../lib/admin';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

/**
 * One-time plan seeding.
 *
 * The admin console can edit a plan once it exists, but has no "create a
 * new plan" button — plans are meant to be seeded once, outside the app,
 * the same way the first admin is. This stands in for that step. `update: {}`
 * means an existing row is left untouched, so running this again after
 * prices have already been edited in the admin console does not overwrite
 * them.
 */
const DEFAULT_PLANS = [
  {
    code: 'free' as const,
    name: 'Free',
    priceMinor: 0,
    currency: 'USD',
    intervalDays: 30,
    imageQuota: 2,
    videoQuota: 2,
    maxVideoSeconds: 10,
    websiteQuota: 1,
    gameQuota: 1,
    documentQuota: 5,
  },
  {
    code: 'premium_monthly' as const,
    name: 'Premium Monthly',
    priceMinor: 3000, // $30.00
    currency: 'USD',
    intervalDays: 30,
    imageQuota: 100,
    videoQuota: 20,
    maxVideoSeconds: 60,
    websiteQuota: 20,
    gameQuota: 20,
    documentQuota: 100,
  },
  {
    code: 'premium_yearly' as const,
    name: 'Premium Yearly',
    priceMinor: 30000, // $300.00
    currency: 'USD',
    intervalDays: 365,
    imageQuota: 1200,
    videoQuota: 240,
    maxVideoSeconds: 60,
    websiteQuota: 240,
    gameQuota: 240,
    documentQuota: 1200,
  },
];

export async function GET(request: Request) {
  try {
    const secret = new URL(request.url).searchParams.get('secret');
    const expected = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!expected || secret !== expected) {
      return Response.json({ error: 'Wrong or missing secret' }, { status: 403 });
    }

    await requireAdmin();

    for (const { code, ...data } of DEFAULT_PLANS) {
      await prisma.plan.upsert({ where: { code }, update: {}, create: { code, ...data } });
    }

    return Response.json({ ok: true, seeded: DEFAULT_PLANS.map((p) => p.code) });
  } catch (error) {
    return errorResponse(error);
  }
}
