import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireAdmin } from '../../../../lib/admin';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const planSchema = z.object({
  code: z.enum(['free', 'premium_monthly', 'premium_yearly']),
  name: z.string().min(1).max(80),
  active: z.boolean().default(true),
  priceMinor: z.number().int().min(0),
  currency: z.string().length(3),
  promoPriceMinor: z.number().int().min(0).optional(),
  promoEndsAt: z.string().datetime().optional(),
  introPriceMinor: z.number().int().min(0).optional(),
  intervalDays: z.number().int().min(1).max(400),
  imageQuota: z.number().int().min(0),
  videoQuota: z.number().int().min(0),
  maxVideoSeconds: z.number().int().min(1).max(600),
  websiteQuota: z.number().int().min(0),
  gameQuota: z.number().int().min(0),
  documentQuota: z.number().int().min(0),
});

export async function GET() {
  try {
    await requireAdmin();
    const plans = await prisma.plan.findMany({ orderBy: { priceMinor: 'asc' } });
    return Response.json({ plans });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Prices and quotas are owner-configured; nothing here is hard-coded. */
export async function PUT(request: Request) {
  try {
    const adminId = await requireAdmin();
    const body = planSchema.parse(await request.json());

    const { code, promoEndsAt, introPriceMinor, ...rest } = body;
    const data = {
      ...rest,
      // Zero or blank means "no first-purchase offer", stored as null.
      introPriceMinor: introPriceMinor && introPriceMinor > 0 ? introPriceMinor : null,
      ...(promoEndsAt ? { promoEndsAt: new Date(promoEndsAt) } : {}),
    };

    const plan = await prisma.plan.upsert({
      where: { code },
      update: data,
      create: { code, ...data },
    });

    await prisma.auditLog.create({
      data: { userId: adminId, action: 'admin.plan.update', target: code },
    });

    return Response.json({ id: plan.id, code: plan.code });
  } catch (error) {
    return errorResponse(error);
  }
}
