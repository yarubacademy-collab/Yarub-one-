import { z } from 'zod';
import { prisma } from '@yarub/db';
import { requireUserId } from '../../../lib/session';
import { hasNeverSubscribed } from '../../../lib/checkout-price';
import { errorResponse } from '../chat/stream/route';

export const runtime = 'nodejs';

const actionSchema = z.object({
  action: z.enum(['subscribe', 'cancel', 'resume']),
  planCode: z.enum(['premium_monthly', 'premium_yearly']).optional(),
});

export async function GET() {
  try {
    const userId = await requireUserId();

    const [current, history, plans, firstPurchase] = await Promise.all([
      prisma.subscription.findFirst({
        where: { userId, status: { in: ['active', 'grace', 'cancelled'] } },
        orderBy: { createdAt: 'desc' },
        include: { plan: true },
      }),
      prisma.billingEvent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.plan.findMany({ where: { active: true }, orderBy: { priceMinor: 'asc' } }),
      hasNeverSubscribed(userId),
    ]);

    return Response.json({
      // Prices come from the database, never from UI text.
      // The first-purchase price is shown only to an account that can still use
      // it; everyone else simply sees the regular price.
      plans: plans.map((plan) => ({
        ...plan,
        introPriceMinor: firstPurchase ? plan.introPriceMinor : null,
      })),
      subscription: current
        ? {
            planCode: current.plan.code,
            status: current.status,
            startedAt: current.startedAt,
            expiresAt: current.expiresAt,
            cancelledAt: current.cancelledAt,
          }
        : null,
      history,
      /**
       * No payment provider is connected. The subscribe action below records
       * intent and history; it does not and must not simulate a payment.
       */
      paymentStatus: 'NEEDS_CREDENTIAL',
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    const body = actionSchema.parse(await request.json());

    if (body.action === 'cancel') {
      // Cancellation is not deletion: access continues until the paid term ends.
      const current = await prisma.subscription.findFirst({
        where: { userId, status: { in: ['active', 'grace'] } },
        orderBy: { createdAt: 'desc' },
      });
      if (!current) {
        return Response.json({ code: 'NOT_FOUND', message: 'No active subscription' }, { status: 404 });
      }

      await prisma.subscription.update({
        where: { id: current.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      await prisma.billingEvent.create({
        data: { userId, type: 'subscription.cancelled', planCode: null },
      });

      return Response.json({ ok: true, status: 'cancelled' });
    }

    if (body.action === 'resume') {
      const cancelled = await prisma.subscription.findFirst({
        where: { userId, status: 'cancelled' },
        orderBy: { createdAt: 'desc' },
      });
      if (!cancelled || (cancelled.expiresAt && cancelled.expiresAt < new Date())) {
        return Response.json({ code: 'NOT_FOUND', message: 'Nothing to resume' }, { status: 404 });
      }

      await prisma.subscription.update({
        where: { id: cancelled.id },
        data: { status: 'active', cancelledAt: null },
      });
      await prisma.billingEvent.create({ data: { userId, type: 'subscription.resumed' } });

      return Response.json({ ok: true, status: 'active' });
    }

    /**
     * Subscribe. There is no payment provider configured, so this cannot and
     * does not activate a paid plan — pretending otherwise would be exactly the
     * fake success this product forbids. It records the request so the owner
     * can see demand and grant manually, and returns the configuration that is
     * missing.
     */
    await prisma.billingEvent.create({
      data: {
        userId,
        type: 'subscription.requested',
        planCode: body.planCode ?? null,
        provider: null,
      },
    });

    return Response.json(
      {
        code: 'NOT_CONFIGURED',
        message: 'Payment provider is not configured.',
        requires: 'PAYMENT_PROVIDER_CREDENTIALS',
      },
      { status: 503 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
