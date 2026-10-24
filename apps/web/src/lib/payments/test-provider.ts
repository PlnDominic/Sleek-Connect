import { createHmac, timingSafeEqual } from 'node:crypto';
import { WebhookSignatureError, type PaymentProvider, type PaymentResult } from './types';

export const TEST_SIGNATURE_HEADER = 'x-sleek-signature';

function sign(body: string, secret: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
}

/**
 * A stand-in provider for development: no prompt is sent and no money moves. Outcomes are posted to the webhook by
 * `npm run payments:simulate`, signed with PAYMENT_WEBHOOK_SECRET.
 */
export function createTestProvider(secret: string): PaymentProvider {
  return {
    name: 'test',
    testMode: true,

    async requestPayment(request) {
      console.info(`[test payments] would request GH₵ ${request.amountGhs} for ${request.orderNumber} (${request.reference})`);
    },

    async readWebhook(rawBody, headers) {
      const given = Buffer.from(headers.get(TEST_SIGNATURE_HEADER) ?? '');
      const expected = Buffer.from(sign(rawBody, secret));
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new WebhookSignatureError();

      const body = JSON.parse(rawBody) as { reference?: unknown; status?: unknown; amount_ghs?: unknown };
      if (typeof body.reference !== 'string' || typeof body.amount_ghs !== 'number') return null;
      if (body.status !== 'succeeded' && body.status !== 'failed') return null;
      return { reference: body.reference, status: body.status, amountGhs: body.amount_ghs, event: body };
    },

    // The signed notification is the only source of truth for the test provider.
    async verify(notified: PaymentResult) {
      return notified;
    },
  };
}
