import type { Capability } from '@yarub/shared';

/**
 * Credit accounting.
 *
 * This module is deliberately pure arithmetic and contains no payment
 * integration. There is no Stripe key, no checkout, no invoice — inventing one
 * would be exactly the kind of fake functionality this product forbids. What
 * exists is the ledger a real billing system would sit on top of: grants in,
 * usage-derived debits out, and a balance that is always recomputed rather
 * than cached, so it can never drift from what was actually spent.
 *
 * Connecting a payment provider later means writing grant rows from a webhook.
 * Nothing above this layer has to change.
 */

/**
 * Credits per unit of capability. Units differ per capability: output tokens
 * for text, images for image, seconds for video, characters for speech.
 * The ratios reflect relative cost, not any vendor's price list.
 */
export const CREDIT_RATES: Record<Capability, number> = {
  'text.generate': 0.00002,
  'text.reason': 0.00008,
  'text.translate': 0.00002,
  'image.generate': 4,
  'image.edit': 4,
  'video.textToVideo': 50,
  'video.imageToVideo': 50,
  'speech.tts': 0.0002,
  'speech.stt': 0.001,
  'code.generate': 0.00008,
  // Rendering runs locally, so it costs no credits.
  'document.render': 0,
  // Embeddings back project memory; cheap but not free.
  'embedding.create': 0.000001,
};

export interface Grant {
  credits: number;
  createdAt: Date;
  expiresAt?: Date | null;
}

export interface Debit {
  capability: Capability;
  units: number;
  at: Date;
}

export interface Balance {
  granted: number;
  spent: number;
  remaining: number;
  expired: number;
}

export function creditsFor(capability: Capability, units: number): number {
  if (units < 0) throw new Error('Units cannot be negative');
  return round(CREDIT_RATES[capability] * units);
}

/**
 * Expired grants are reported separately rather than silently dropped, so a
 * user can see why their balance fell without a purchase or a charge.
 */
export function computeBalance(grants: Grant[], debits: Debit[], now = new Date()): Balance {
  let granted = 0;
  let expired = 0;

  for (const grant of grants) {
    if (grant.expiresAt && grant.expiresAt <= now) {
      expired = round(expired + grant.credits);
    } else {
      granted = round(granted + grant.credits);
    }
  }

  const spent = round(
    debits.reduce((total, debit) => total + creditsFor(debit.capability, debit.units), 0),
  );

  return { granted, spent, expired, remaining: round(granted - spent) };
}

/**
 * Affordability is checked before an expensive step runs, not after. A video
 * render that would overdraw the balance is refused up front rather than
 * discovered when the provider bill arrives.
 */
export function canAfford(balance: Balance, capability: Capability, units: number): boolean {
  return balance.remaining >= creditsFor(capability, units);
}

/** Per-capability breakdown for the usage panel. */
export function spendByCapability(debits: Debit[]): Array<{ capability: Capability; credits: number; units: number }> {
  const totals = new Map<Capability, { credits: number; units: number }>();

  for (const debit of debits) {
    const current = totals.get(debit.capability) ?? { credits: 0, units: 0 };
    totals.set(debit.capability, {
      credits: round(current.credits + creditsFor(debit.capability, debit.units)),
      units: current.units + debit.units,
    });
  }

  return [...totals.entries()]
    .map(([capability, value]) => ({ capability, ...value }))
    .sort((a, b) => b.credits - a.credits);
}

/** Four decimal places, matching the Decimal(14,4) column. */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export * from './entitlements.js';
export * from './payments.js';
