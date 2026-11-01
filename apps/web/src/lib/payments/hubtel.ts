import { createHmac, timingSafeEqual } from 'node:crypto';
import { siteUrl } from '@/lib/site';
import { WebhookSignatureError, type PaymentProvider, type PaymentResult } from './types';

/**
 * Hubtel Online Checkout: one hosted page for Mobile Money (MTN, Telecel, AT) and bank cards. We create a checkout
 * invoice, send the shopper to Hubtel's page, and Hubtel posts the result to our callback. Nothing from the callback is
 * trusted by itself: the amount and the outcome are confirmed with Hubtel's Transaction Status API before an order is
 * marked paid.
 *
 * Reference: https://developers.hubtel.com (Online Checkout and Transaction Status Check).
 */

export interface HubtelConfig {
  /** API ID and API Key of the Hubtel "Online Checkout" integration (HTTP Basic credentials). */
  apiId: string;
  apiKey: string;
  /** Hubtel merchant account number (also the POS Sales ID used by the status check). */
  merchantAccount: string;
  /** Secret behind the callback address; Hubtel's callback has no signature of its own. */
  webhookSecret: string;
  initiateUrl: string;
  statusBaseUrl: string;
  card: boolean;
  /** Skip the status check (weaker). Only for a host without an IP address Hubtel can whitelist. */
  skipStatusCheck: boolean;
}

const DEFAULT_INITIATE_URL = 'https://payproxyapi.hubtel.com/items/initiate';
const DEFAULT_STATUS_URL = 'https://api-txnstatus.hubtel.com';

const clean = (value: string | undefined) => value?.trim() || undefined;

/** The Hubtel settings from the environment, or null when any required one is missing. */
export function hubtelConfig(env: Record<string, string | undefined> = process.env): HubtelConfig | null {
  const apiId = clean(env.HUBTEL_API_ID);
  const apiKey = clean(env.HUBTEL_API_KEY);
  const merchantAccount = clean(env.HUBTEL_MERCHANT_ACCOUNT);
  const webhookSecret = clean(env.PAYMENT_WEBHOOK_SECRET);
  if (!apiId || !apiKey || !merchantAccount || !webhookSecret) return null;
  return {
    apiId,
    apiKey,
    merchantAccount,
    webhookSecret,
    initiateUrl: clean(env.HUBTEL_INITIATE_URL) ?? DEFAULT_INITIATE_URL,
    statusBaseUrl: (clean(env.HUBTEL_STATUS_URL) ?? DEFAULT_STATUS_URL).replace(/\/+$/, ''),
    card: clean(env.HUBTEL_CARD)?.toLowerCase() !== 'off',
    skipStatusCheck: clean(env.HUBTEL_SKIP_STATUS_CHECK)?.toLowerCase() === 'true',
  };
}

/** The secret in the callback address, derived so the raw webhook secret never appears in a URL or a log. */
export function hubtelCallbackToken(secret: string): string {
  return createHmac('sha256', secret).update('hubtel-callback').digest('hex').slice(0, 40);
}

/** Hubtel wants Ghana numbers as 233XXXXXXXXX (024 123 4567 → 233241234567). */
export function hubtelMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('233')) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `233${digits.slice(1)}`;
  return digits;
}

const basicAuth = (config: HubtelConfig) => `Basic ${Buffer.from(`${config.apiId}:${config.apiKey}`).toString('base64')}`;

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {});
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const num = (value: unknown): number | undefined => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
/** First defined value among Hubtel's PascalCase and camelCase spellings, in the callback's `Data` object or at its root. */
const pick = (data: Json, root: Json, ...keys: string[]): unknown => {
  for (const source of [data, root]) for (const key of keys) if (source[key] !== undefined) return source[key];
  return undefined;
};

const sameSecret = (given: string, expected: string) => {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

export function createHubtelProvider(config: HubtelConfig, fetchImpl: typeof fetch = fetch): PaymentProvider {
  const callbackToken = hubtelCallbackToken(config.webhookSecret);

  return {
    name: 'hubtel',
    testMode: false,
    supportsCard: config.card,
    hostedCheckout: true,

    async requestPayment(request) {
      const body: Json = {
        totalAmount: Number(request.amountGhs.toFixed(2)),
        description: `Sleek Connect Store: ${request.orderNumber}`,
        callbackUrl: `${siteUrl()}/api/payments/webhook?token=${callbackToken}`,
        returnUrl: `${siteUrl()}${request.returnPath}`,
        cancellationUrl: `${siteUrl()}${request.returnPath}`,
        merchantAccountNumber: config.merchantAccount,
        // Hubtel allows 32 characters; ours are 20 or fewer.
        clientReference: request.reference,
      };
      // Mobile Money: pre-fill the number the shopper typed at checkout. They can still change it on Hubtel's page.
      if (request.method === 'momo' && request.wallet) body.payeeMobileNumber = hubtelMsisdn(request.wallet);

      const response = await fetchImpl(config.initiateUrl, {
        method: 'POST',
        headers: { Authorization: basicAuth(config), 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
      const json = asObject(await response.json().catch(() => null));
      const data = asObject(json.data ?? json.Data);
      const code = text(json.responseCode ?? json.ResponseCode);
      const checkoutUrl = text(data.checkoutUrl ?? data.CheckoutUrl) ?? text(data.checkoutDirectUrl ?? data.CheckoutDirectUrl);
      if (!response.ok || (code !== undefined && code !== '0000') || !checkoutUrl) {
        // Never log the credentials; the response says what is wrong (for example an unapproved merchant account).
        throw new Error(`Hubtel did not create the checkout (HTTP ${response.status}, code ${code ?? 'none'}): ${text(json.message ?? json.Message) ?? 'no message'}`);
      }
      return { checkoutUrl };
    },

    async readWebhook(rawBody, _headers, url) {
      const given = url?.searchParams.get('token') ?? '';
      if (!sameSecret(given, callbackToken)) throw new WebhookSignatureError();

      const root = asObject(JSON.parse(rawBody));
      const data = asObject(root.Data ?? root.data);
      const reference = text(pick(data, root, 'ClientReference', 'clientReference'));
      if (!reference) return null;
      const responseCode = text(root.ResponseCode ?? root.responseCode);
      const status = (text(pick(data, root, 'Status', 'status')) ?? '').toLowerCase();
      const amount = num(pick(data, root, 'Amount', 'amount')) ?? 0;
      // Only an explicit success or an explicit failure is an outcome; anything else (such as "pending") is ignored.
      if (responseCode === '0000' && status === 'success') return { reference, status: 'succeeded', amountGhs: amount, event: root };
      if (status === 'failed' || status === 'declined' || status === 'cancelled') return { reference, status: 'failed', amountGhs: amount, event: root };
      return null;
    },

    async verify(notified: PaymentResult) {
      if (config.skipStatusCheck) return notified;
      const url = `${config.statusBaseUrl}/transactions/${encodeURIComponent(config.merchantAccount)}/status?clientReference=${encodeURIComponent(notified.reference)}`;
      const response = await fetchImpl(url, {
        headers: { Authorization: basicAuth(config), Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      });
      // Not a final answer: let Hubtel retry its callback (a 403 here usually means our IP isn't whitelisted yet).
      if (!response.ok) throw new Error(`Hubtel status check failed (HTTP ${response.status}) for ${notified.reference}`);
      const json = asObject(await response.json().catch(() => null));
      const data = asObject(json.data ?? json.Data);
      const state = (text(data.status ?? data.Status) ?? '').toLowerCase();
      const reference = text(data.clientReference ?? data.ClientReference);
      if (reference !== undefined && reference !== notified.reference) throw new Error(`Hubtel status check answered for another payment (${reference})`);
      // Only money Hubtel says it holds counts, and its own amount is what we compare, not the callback's.
      if (state === 'paid') {
        const amount = num(data.amount ?? data.Amount);
        if (amount === undefined) throw new Error(`Hubtel status check had no amount for ${notified.reference}`);
        return { reference: notified.reference, status: 'succeeded', amountGhs: amount, event: { callback: notified.event, status: json } };
      }
      if (state === 'unpaid' && notified.status === 'failed') {
        return { reference: notified.reference, status: 'failed', amountGhs: 0, event: { callback: notified.event, status: json } };
      }
      return null;
    },
  };
}
