import type { MomoNetwork } from '@sleek/shared';

/** What we ask a provider to charge. The amount always comes from the database, never the browser. */
export interface PaymentRequest {
  /** Our unique reference for this attempt. The provider echoes it back in its notifications. */
  reference: string;
  orderNumber: string;
  amountGhs: number;
  network: MomoNetwork;
  wallet: string;
}

/** A final payment outcome reported by a provider. */
export interface PaymentResult {
  reference: string;
  status: 'succeeded' | 'failed';
  /** What the provider says it actually charged, in GH₵. */
  amountGhs: number;
  /** The provider's payload, kept on the payment record for support. */
  event: Record<string, unknown>;
}

/**
 * A payment provider (Mobile Money aggregator, card processor, …). Adding a real provider means implementing this
 * interface and registering it in `getPaymentProvider`; checkout and the webhook route don't change.
 */
export interface PaymentProvider {
  /** Stored with each payment, so keep it stable once payments exist. */
  readonly name: string;
  /** True when no real money moves. */
  readonly testMode: boolean;
  /** Asks the provider to charge the shopper, for example by sending the Mobile Money approval prompt. */
  requestPayment(request: PaymentRequest): Promise<void>;
  /**
   * Checks that a webhook really came from the provider and reads it. Returns null for notifications that aren't a
   * final payment outcome. Throws `WebhookSignatureError` when the signature doesn't match.
   */
  readWebhook(rawBody: string, headers: Headers): Promise<PaymentResult | null>;
  /**
   * Confirms the outcome with the provider itself (for real providers, a server-to-server status lookup) instead of
   * trusting the notification body alone. Returns null if the provider has no final outcome yet.
   */
  verify(notified: PaymentResult): Promise<PaymentResult | null>;
}

export class WebhookSignatureError extends Error {
  constructor() {
    super('Webhook signature does not match.');
    this.name = 'WebhookSignatureError';
  }
}
