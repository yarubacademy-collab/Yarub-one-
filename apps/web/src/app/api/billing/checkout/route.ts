import { z } from 'zod';
import { prisma } from '@yarub/db';
import { loadConfig } from '@yarub/config';
import { requireUserId } from '../../../../lib/session';
import { enforceRateLimit } from '../../../../lib/rate-limit';
import { payments } from '../../../../lib/payments';
import { checkoutPrice, hasNeverSubscribed } from '../../../../lib/checkout-price';
import { errorResponse } from '../../chat/stream/route';

export const runtime = 'nodejs';

const schema = z.object({
  planCode: z.enum(['premium_monthly', 'premium_yearly']),
  locale: z.enum(['ar', 'ur', 'en']),
});

/**
 * Starts a checkout.
 *
 * The price is read from the Plan table, never from the request: a client that
 * could name its own price could buy Premium for nothing. An unpriced plan is
 * refused rather than checked out at zero.
 */
export async function POST(request: Request) {
  try {
    const userId = await requireUserId();
    await enforceRateLimit(`checkout:${userId}`, 10);

    const body = schema.parse(await request.json());
    const provider = payments();

    if (!provider.isConfigured()) {
      await prisma.billingEvent.create({
        data: { userId, type: 'subscription.requested', planCode: body.planCode, provider: null },
      });
      return Response.json(
        {
          code: 'NOT_CONFIGURED',
          message: 'Payment provider is not configured.',
          requires: ['PAYMENT_API_KEY', 'PAYMENT_WEBHOOK_SECRET', 'PAYMENT_CHECKOUT_URL'],
        },
        { status: 503 },
      );
    }

    const plan = await prisma.plan.findFirst({ where: { code: body.planCode, active: true } });
    if (!plan) {
      return Response.json({ code: 'NOT_FOUND', message: 'Plan not available' }, { status: 404 });
    }

    // A first-ever purchase may carry a one-time introductory price. Whether it
    // does is decided here from the account's own history, never from the request.
    const { priceMinor } = checkoutPrice(plan, await hasNeverSubscribed(userId));

    if (priceMinor <= 0) {
      // An unpriced plan means the owner has not finished configuring it.
      return Response.json(
        { code: 'NOT_CONFIGURED', message: 'This plan has no price set.' },
        { status: 503 },
      );
    }

    const appUrl = loadConfig().APP_URL;
    const session = await provider.createCheckout({
      userRef: userId,
      planCode: body.planCode,
      priceMinor,
      currency: plan.currency,
      intervalDays: plan.intervalDays,
      successUrl: `${appUrl}/${body.locale}/pricing?status=success`,
      cancelUrl: `${appUrl}/${body.locale}/pricing?status=cancelled`,
    });

    await prisma.billingEvent.create({
      data: {
        userId,
        type: 'checkout.started',
        planCode: body.planCode,
        amountMinor: priceMinor,
        currency: plan.currency,
        provider: provider.id,
        externalRef: session.externalRef,
      },
    });

    return Response.json({ redirectUrl: session.redirectUrl });
  } catch (error) {
    return errorResponse(error);
  }
}
