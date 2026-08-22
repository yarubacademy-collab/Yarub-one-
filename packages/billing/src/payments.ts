import { createHmac, timingSafeEqual } from 'node:crypto';
import type { PlanTier } from './entitlements.js';

/**
 * Payment provider abstraction.
 *
 * No payment provider is hard-coded and none is simulated. What exists here is
 * the contract a real provider plugs into: a checkout session it creates, a
 * webhook it signs, and a normalised event the application acts on. Supplying
 * credentials activates the flow without touching anything above this layer.
 *
 * The verification below is the security-critical part. A webhook endpoint that
 * trusts its payload is a free-subscription endpoint, so signature checking is
 * mandatory, constant-time, and replay-protected by timestamp.
 */

export type BillingEventType =
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'subscription.expired'
  | 'payment.failed';

/** Provider-agnostic shape the application acts on. */
export interface NormalisedBillingEvent {
  type: BillingEventType;
  /** Correlates back to the user; set when the checkout session was created. */
  userRef: string;
  planCode: PlanTier;
  externalRef: string;
  amountMinor?: number;
  currency?: string;
  /** End of the paid term, when the provider supplies one. */
  periodEnd?: Date;
  occurredAt: Date;
}

export interface CheckoutSession {
  /** Where to send the user to complete payment. */
  redirectUrl: string;
  externalRef: string;
}

export interface CheckoutRequest {
  userRef: string;
  planCode: PlanTier;
  priceMinor: number;
  currency: string;
  intervalDays: number;
  successUrl: string;
  cancelUrl: string;
}

export interface PaymentProvider {
  readonly id: string;
  /** False when credentials are absent; the app then reports NEEDS_CREDENTIAL. */
  isConfigured(): boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Throws on an invalid signature. Never returns a partially-trusted event.
   * `nowSeconds` is injectable so replay-window behaviour is testable without
   * depending on the wall clock.
   */
  parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
    nowSeconds?: number,
  ): NormalisedBillingEvent;
  cancelSubscription(externalRef: string): Promise<void>;
}

export class PaymentNotConfiguredError extends Error {
  readonly code = 'NEEDS_CREDENTIAL';
  constructor(providerId: string) {
    super(`Payment provider ${providerId} has no credentials configured`);
  }
}

export class WebhookVerificationError extends Error {
  constructor(reason: string) {
    super(`Webhook rejected: ${reason}`);
  }
}

/** Maximum age of a signed payload, in seconds. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Verifies an HMAC-SHA256 signature over `timestamp.body`, the scheme used by
 * most payment providers.
 *
 * Including the timestamp inside the signed material is what makes replay
 * protection real: an attacker cannot take yesterday's valid "subscription
 * activated" payload and resend it with a fresh timestamp, because changing the
 * timestamp invalidates the signature.
 */
export function verifyHmacSignature(input: {
  rawBody: string;
  signatureHeader: string;
  timestampHeader: string;
  secret: string;
  nowSeconds?: number;
  toleranceSeconds?: number;
}): void {
  const tolerance = input.toleranceSeconds ?? WEBHOOK_TOLERANCE_SECONDS;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);

  const timestamp = Number(input.timestampHeader);
  if (!Number.isFinite(timestamp)) {
    throw new WebhookVerificationError('missing or malformed timestamp');
  }

  if (Math.abs(now - timestamp) > tolerance) {
    throw new WebhookVerificationError('timestamp outside tolerance');
  }

  const expected = createHmac('sha256', input.secret)
    .update(`${input.timestampHeader}.${input.rawBody}`)
    .digest('hex');

  const provided = input.signatureHeader.trim().toLowerCase();

  // Length is compared first because timingSafeEqual throws on a mismatch;
  // an attacker learns only that the length differed, not any byte value.
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');

  if (expectedBuf.length !== providedBuf.length) {
    throw new WebhookVerificationError('signature mismatch');
  }
  if (!timingSafeEqual(expectedBuf, providedBuf)) {
    throw new WebhookVerificationError('signature mismatch');
  }
}

/**
 * Generic HMAC provider.
 *
 * Implements the shape shared by common hosted checkout providers. A vendor
 * with a different scheme gets its own adapter file; nothing above this
 * interface changes. With no credentials it reports unconfigured and refuses
 * every operation rather than pretending to succeed.
 */
export interface HmacPaymentOptions {
  id: string;
  apiKey: string | undefined;
  webhookSecret: string | undefined;
  checkoutUrl: string | undefined;
}

export class HmacPaymentProvider implements PaymentProvider {
  readonly id: string;

  constructor(private readonly opts: HmacPaymentOptions) {
    this.id = opts.id;
  }

  isConfigured(): boolean {
    return Boolean(this.opts.apiKey && this.opts.webhookSecret && this.opts.checkoutUrl);
  }

  private assertConfigured(): void {
    if (!this.isConfigured()) throw new PaymentNotConfiguredError(this.id);
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    this.assertConfigured();

    const response = await fetch(`${this.opts.checkoutUrl}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.opts.apiKey}`,
      },
      body: JSON.stringify({
        client_reference_id: request.userRef,
        mode: 'subscription',
        amount: request.priceMinor,
        currency: request.currency,
        interval_days: request.intervalDays,
        metadata: { planCode: request.planCode },
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
      }),
    });

    if (!response.ok) {
      throw new Error(`Checkout creation failed with ${response.status}`);
    }

    const data = (await response.json()) as { url?: string; id?: string };
    if (!data.url || !data.id) throw new Error('Checkout response missing url or id');

    return { redirectUrl: data.url, externalRef: data.id };
  }

  parseWebhook(
    rawBody: string,
    headers: Record<string, string>,
    nowSeconds?: number,
  ): NormalisedBillingEvent {
    this.assertConfigured();

    verifyHmacSignature({
      rawBody,
      signatureHeader: headers['x-signature'] ?? '',
      timestampHeader: headers['x-timestamp'] ?? '',
      secret: this.opts.webhookSecret!,
      ...(nowSeconds !== undefined ? { nowSeconds } : {}),
    });

    const payload = JSON.parse(rawBody) as {
      type?: string;
      data?: {
        client_reference_id?: string;
        id?: string;
        metadata?: { planCode?: string };
        amount?: number;
        currency?: string;
        current_period_end?: number;
      };
      created?: number;
    };

    const type = mapEventType(payload.type);
    if (!type) throw new WebhookVerificationError(`unsupported event type: ${payload.type}`);

    const userRef = payload.data?.client_reference_id;
    const planCode = payload.data?.metadata?.planCode as PlanTier | undefined;
    if (!userRef || !planCode) {
      throw new WebhookVerificationError('event missing user reference or plan');
    }

    return {
      type,
      userRef,
      planCode,
      externalRef: payload.data?.id ?? '',
      ...(payload.data?.amount !== undefined ? { amountMinor: payload.data.amount } : {}),
      ...(payload.data?.currency ? { currency: payload.data.currency } : {}),
      ...(payload.data?.current_period_end
        ? { periodEnd: new Date(payload.data.current_period_end * 1000) }
        : {}),
      occurredAt: payload.created ? new Date(payload.created * 1000) : new Date(),
    };
  }

  async cancelSubscription(externalRef: string): Promise<void> {
    this.assertConfigured();
    const response = await fetch(`${this.opts.checkoutUrl}/subscriptions/${externalRef}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.opts.apiKey}` },
    });
    if (!response.ok) throw new Error(`Cancellation failed with ${response.status}`);
  }
}

export function mapEventType(raw: string | undefined): BillingEventType | undefined {
  switch (raw) {
    case 'subscription.created':
    case 'checkout.completed':
      return 'subscription.activated';
    case 'invoice.paid':
    case 'subscription.renewed':
      return 'subscription.renewed';
    case 'subscription.deleted':
    case 'subscription.cancelled':
      return 'subscription.cancelled';
    case 'subscription.expired':
      return 'subscription.expired';
    case 'invoice.payment_failed':
    case 'payment.failed':
      return 'payment.failed';
    default:
      return undefined;
  }
}
