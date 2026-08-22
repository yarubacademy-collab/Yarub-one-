import { HmacPaymentProvider, type PaymentProvider } from '@yarub/billing';
import { loadConfig } from '@yarub/config';

/**
 * One payment provider per process, built from configuration.
 *
 * Swapping providers means a different adapter here. The webhook route, the
 * checkout route and the subscription model are all provider-agnostic.
 */
let instance: PaymentProvider | undefined;

export function payments(): PaymentProvider {
  if (!instance) {
    const config = loadConfig();
    instance = new HmacPaymentProvider({
      id: 'payments-primary',
      apiKey: config.PAYMENT_API_KEY,
      webhookSecret: config.PAYMENT_WEBHOOK_SECRET,
      checkoutUrl: config.PAYMENT_CHECKOUT_URL,
    });
  }
  return instance;
}
