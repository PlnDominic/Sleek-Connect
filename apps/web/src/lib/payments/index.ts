import 'server-only';
import { createHubtelProvider, hubtelConfig } from './hubtel';
import { testModesAllowed } from '@/lib/dev-modes';
import { createTestProvider } from './test-provider';
import type { PaymentProvider } from './types';

export type { PaymentProvider, PaymentRequest, PaymentResult } from './types';
export { WebhookSignatureError } from './types';

/**
 * The provider named by PAYMENT_PROVIDER, or null when online payment is switched off or misconfigured.
 * `hubtel` is the real one (Mobile Money and cards); `test` stands in for it in automated tests only.
 */
export function getPaymentProvider(): PaymentProvider | null {
  const name = process.env.PAYMENT_PROVIDER;
  if (!name) return null;

  if (name === 'test') {
    if (!testModesAllowed()) {
      console.error('The test payment provider is only for automated tests (ENABLE_TEST_MODES=true), so online payment is off.');
      return null;
    }
    const secret = process.env.PAYMENT_WEBHOOK_SECRET;
    if (!secret) {
      console.error('PAYMENT_WEBHOOK_SECRET is not set, so the test payment provider is off.');
      return null;
    }
    return createTestProvider(secret);
  }

  if (name === 'hubtel') {
    const config = hubtelConfig();
    if (!config) {
      console.error('HUBTEL_API_ID, HUBTEL_API_KEY, HUBTEL_MERCHANT_ACCOUNT or PAYMENT_WEBHOOK_SECRET is not set, so Hubtel payments are off.');
      return null;
    }
    return createHubtelProvider(config);
  }

  console.error(`Unknown PAYMENT_PROVIDER "${name}", so online payment is off.`);
  return null;
}
