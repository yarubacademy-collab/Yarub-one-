import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  HmacPaymentProvider,
  PaymentNotConfiguredError,
  WebhookVerificationError,
  mapEventType,
  verifyHmacSignature,
} from '../packages/billing/src/payments';

const SECRET = 'whsec_test_secret_value';
const NOW = 1_800_000_000;

function sign(body: string, timestamp: number, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

describe('webhook signature verification', () => {
  const body = JSON.stringify({ type: 'subscription.created' });

  it('accepts a correctly signed recent payload', () => {
    expect(() =>
      verifyHmacSignature({
        rawBody: body,
        signatureHeader: sign(body, NOW),
        timestampHeader: String(NOW),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).not.toThrow();
  });

  it('rejects a forged signature', () => {
    expect(() =>
      verifyHmacSignature({
        rawBody: body,
        signatureHeader: 'a'.repeat(64),
        timestampHeader: String(NOW),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a payload signed with the wrong secret', () => {
    expect(() =>
      verifyHmacSignature({
        rawBody: body,
        signatureHeader: sign(body, NOW, 'wrong_secret'),
        timestampHeader: String(NOW),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a tampered body even with a once-valid signature', () => {
    // The classic attack: keep the signature, swap the plan for a better one.
    const signature = sign(body, NOW);
    const tampered = JSON.stringify({ type: 'subscription.created', extra: 'premium_yearly' });
    expect(() =>
      verifyHmacSignature({
        rawBody: tampered,
        signatureHeader: signature,
        timestampHeader: String(NOW),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a replayed payload from outside the tolerance window', () => {
    const old = NOW - 3600;
    expect(() =>
      verifyHmacSignature({
        rawBody: body,
        signatureHeader: sign(body, old),
        timestampHeader: String(old),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toThrow(/tolerance/);
  });

  it('rejects a replay whose timestamp was refreshed', () => {
    // Refreshing the timestamp invalidates the signature, which is the point
    // of signing timestamp and body together.
    expect(() =>
      verifyHmacSignature({
        rawBody: body,
        signatureHeader: sign(body, NOW - 3600),
        timestampHeader: String(NOW),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toThrow(WebhookVerificationError);
  });

  it('rejects a missing timestamp', () => {
    expect(() =>
      verifyHmacSignature({
        rawBody: body,
        signatureHeader: sign(body, NOW),
        timestampHeader: '',
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toThrow(/timestamp/);
  });

  it('rejects a future timestamp beyond tolerance', () => {
    const future = NOW + 3600;
    expect(() =>
      verifyHmacSignature({
        rawBody: body,
        signatureHeader: sign(body, future),
        timestampHeader: String(future),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toThrow(/tolerance/);
  });
});

describe('unconfigured payment provider', () => {
  const provider = new HmacPaymentProvider({
    id: 'payments-primary',
    apiKey: undefined,
    webhookSecret: undefined,
    checkoutUrl: undefined,
  });

  it('reports itself unconfigured', () => {
    expect(provider.isConfigured()).toBe(false);
  });

  it('refuses checkout instead of returning a fake session', async () => {
    await expect(
      provider.createCheckout({
        userRef: 'u1', planCode: 'premium_monthly', priceMinor: 999,
        currency: 'USD', intervalDays: 30, successUrl: '/s', cancelUrl: '/c',
      }),
    ).rejects.toThrow(PaymentNotConfiguredError);
  });

  it('refuses to parse a webhook it cannot verify', () => {
    expect(() => provider.parseWebhook('{}', {})).toThrow(PaymentNotConfiguredError);
  });
});

describe('configured provider webhook parsing', () => {
  const provider = new HmacPaymentProvider({
    id: 'payments-primary',
    apiKey: 'sk_test',
    webhookSecret: SECRET,
    checkoutUrl: 'https://payments.example.com',
  });

  function envelope(type: string) {
    return JSON.stringify({
      type,
      created: NOW,
      data: {
        id: 'sub_123',
        client_reference_id: 'user_abc',
        metadata: { planCode: 'premium_monthly' },
        amount: 999,
        currency: 'USD',
        current_period_end: NOW + 2_592_000,
      },
    });
  }

  function headersFor(body: string, now = NOW) {
    return { 'x-signature': sign(body, now), 'x-timestamp': String(now) };
  }

  it('normalises an activation event', () => {
    const body = envelope('subscription.created');
    const event = provider.parseWebhook(body, headersFor(body), NOW);
    expect(event.type).toBe('subscription.activated');
    expect(event.userRef).toBe('user_abc');
    expect(event.planCode).toBe('premium_monthly');
    expect(event.periodEnd).toBeInstanceOf(Date);
  });

  it('rejects an event missing its user reference', () => {
    const body = JSON.stringify({ type: 'subscription.created', data: { id: 'x' } });
    expect(() => provider.parseWebhook(body, headersFor(body), NOW)).toThrow(WebhookVerificationError);
  });

  it('rejects an unknown event type rather than guessing', () => {
    const body = envelope('something.unexpected');
    expect(() => provider.parseWebhook(body, headersFor(body), NOW)).toThrow(/unsupported/);
  });
});

describe('event mapping', () => {
  it('maps provider vocabulary onto our own', () => {
    expect(mapEventType('checkout.completed')).toBe('subscription.activated');
    expect(mapEventType('invoice.paid')).toBe('subscription.renewed');
    expect(mapEventType('subscription.deleted')).toBe('subscription.cancelled');
    expect(mapEventType('invoice.payment_failed')).toBe('payment.failed');
  });

  it('returns undefined for anything unrecognised', () => {
    expect(mapEventType('random.event')).toBeUndefined();
    expect(mapEventType(undefined)).toBeUndefined();
  });
});
