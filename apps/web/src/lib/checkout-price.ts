import { prisma } from '@yarub/db';

/**
 * What a checkout charges.
 *
 * Three prices can apply to a plan, and exactly one is charged:
 *
 *   regular  the plan's own price;
 *   promo    a time-limited price for everyone, when set and not yet expired
 *            (this is the existing promotion, and it behaves exactly as before);
 *   intro    a one-time price for an account making its first-ever purchase.
 *
 * The introductory price is only ever used when it is actually lower than what
 * the account would otherwise pay, so an offer can never cost a customer more.
 * Because each renewal is a new checkout, "first purchase only" needs no
 * bookkeeping beyond asking whether the account has ever held a subscription.
 */

export interface PricedPlan {
  priceMinor: number;
  promoPriceMinor: number | null;
  promoEndsAt: Date | null;
  introPriceMinor: number | null;
}

export type PriceKind = 'regular' | 'promo' | 'intro';

export function checkoutPrice(
  plan: PricedPlan,
  firstPurchase: boolean,
  now: Date = new Date(),
): { priceMinor: number; kind: PriceKind } {
  const promo = plan.promoPriceMinor;
  const promoActive = promo !== null && (!plan.promoEndsAt || plan.promoEndsAt > now);

  const base: { priceMinor: number; kind: PriceKind } = promoActive
    ? { priceMinor: promo, kind: 'promo' }
    : { priceMinor: plan.priceMinor, kind: 'regular' };

  const intro = plan.introPriceMinor;
  if (firstPurchase && intro !== null && intro > 0 && intro < base.priceMinor) {
    return { priceMinor: intro, kind: 'intro' };
  }

  return base;
}

/**
 * True for an account that has never held a subscription, in any status.
 *
 * A subscription row only exists once a payment has actually gone through (or
 * the owner has granted one by hand), so starting a checkout and abandoning it
 * does not use up the offer.
 */
export async function hasNeverSubscribed(userId: string): Promise<boolean> {
  return (await prisma.subscription.count({ where: { userId } })) === 0;
}
