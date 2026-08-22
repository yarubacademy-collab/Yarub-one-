import { prisma } from '@yarub/db';
import { payments } from '../../../../lib/payments';
import { log } from '../../../../lib/logger';

export const runtime = 'nodejs';

/**
 * Payment provider webhook.
 *
 * This endpoint activates paid subscriptions, which makes it the single most
 * attractive target in the application: anyone who can forge a request here
 * grants themselves Premium. So it is unauthenticated by necessity but never
 * unverified — the raw body is read before parsing and the signature is checked
 * against it, because verifying a re-serialised object would verify the wrong
 * bytes.
 *
 * It is also deliberately terse in its responses. A detailed error would let an
 * attacker tune a forgery attempt.
 */
export async function POST(request: Request) {
  const provider = payments();

  if (!provider.isConfigured()) {
    return new Response('Not configured', { status: 503 });
  }

  // Raw text, not request.json(): the signature covers these exact bytes.
  const rawBody = await request.text();
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let event;
  try {
    event = provider.parseWebhook(rawBody, headers);
  } catch (error) {
    log.warn('billing.webhook.rejected', {}, error);
    return new Response('Invalid signature', { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: event.userRef } });
  if (!user) {
    // Acknowledged so the provider stops retrying an event we can never apply.
    log.warn('billing.webhook.unknown_user', { userId: event.userRef });
    return new Response('OK', { status: 200 });
  }

  const plan = await prisma.plan.findFirst({ where: { code: event.planCode } });
  if (!plan) {
    log.error('billing.webhook.unknown_plan', { userId: user.id }, event.planCode);
    return new Response('OK', { status: 200 });
  }

  // History is append-only, written before the state change, so a crash leaves
  // evidence of what was supposed to happen.
  await prisma.billingEvent.create({
    data: {
      userId: user.id,
      type: event.type,
      planCode: event.planCode,
      amountMinor: event.amountMinor ?? null,
      currency: event.currency ?? null,
      provider: provider.id,
      externalRef: event.externalRef,
      payload: JSON.parse(rawBody),
    },
  });

  switch (event.type) {
    case 'subscription.activated':
    case 'subscription.renewed': {
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: { in: ['active', 'grace'] } },
        data: { status: 'expired' },
      });
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: plan.id,
          status: 'active',
          externalRef: event.externalRef,
          expiresAt: event.periodEnd ?? new Date(Date.now() + plan.intervalDays * 86_400_000),
        },
      });
      break;
    }

    case 'subscription.cancelled': {
      // Access continues to term end; cancellation is not revocation.
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: 'active' },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
      break;
    }

    case 'subscription.expired': {
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: { in: ['active', 'grace', 'cancelled'] } },
        data: { status: 'expired' },
      });
      break;
    }

    case 'payment.failed': {
      // Moved to grace rather than expired: a failed charge is often retried,
      // and cutting access on the first failure punishes the wrong thing.
      await prisma.subscription.updateMany({
        where: { userId: user.id, status: 'active' },
        data: { status: 'grace' },
      });
      break;
    }
  }

  log.info('billing.webhook.applied', { userId: user.id }, event.type);
  return new Response('OK', { status: 200 });
}
