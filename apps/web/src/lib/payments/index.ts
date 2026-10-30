import 'server-only';
import { createTestProvider } from './test-provider';
import type { PaymentProvider } from './types';

export type { PaymentProvider, PaymentRequest, PaymentResult } from './types';
export { WebhookSignatureError } from './types';

/**
 * The provider named by PAYMENT_PROVIDER, or null when online payment is switched off or misconfigured.
 * No real provider is wired up yet; add one here once it's chosen.
 */
export function getPaymentProvider(): PaymentProvider | null {
  const name = process.env.PAYMENT_PROVIDER;
  if (!name) return null;

  if (name === 'test') {
    if (process.env.VERCEL_ENV === 'production') {
      console.error('The test payment provider is disabled in production.');
      return null;
    }
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
      console.error('PAYMENT_WEBHOOK_SECRET is not set, so the test payment provider is off.');
      return null;
    }
    return createTestProvider(secret);
  }

  console.error(`Unknown PAYMENT_PROVIDER "${name}", so online payment is off.`);
  return null;
}
