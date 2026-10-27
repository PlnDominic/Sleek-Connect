import { after } from 'next/server';
import { dispatchNotifications } from '@/lib/notifications/dispatch';
import { getPaymentProvider, WebhookSignatureError } from '@/lib/payments';
import { subscriptionReferencePrefix } from '@/lib/payments/subscription';
import { createAdminSupabase } from '@/lib/supabase/admin';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger, requestId, withRequestId } from '@/lib/observability';
import type { Json } from '@/lib/supabase/database.types';

/** Payment provider notifications. Signature checks and confirm_payment make retries idempotent. */
export async function POST(request: Request) {
  const id = requestId(request);
  const limit = rateLimit({ key: `payment-webhook:${clientAddress(request)}`, limit: 120, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);
  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (declaredLength > 64 * 1024) return withRequestId(Response.json({ error: 'Webhook payload is too large.', requestId: id }, { status: 413 }), id);
  const provider = getPaymentProvider();
  if (!provider) return withRequestId(Response.json({ error: 'Online payment is switched off.', requestId: id }, { status: 503 }), id);
  const rawBody = await request.text();
  if (rawBody.length > 64 * 1024) return withRequestId(Response.json({ error: 'Webhook payload is too large.', requestId: id }, { status: 413 }), id);
  let notified;
  try {
    notified = await provider.readWebhook(rawBody, request.headers);
  } catch (error) {
    if (error instanceof WebhookSignatureError) {
      logger.warn('payment_webhook_signature_rejected', { requestId: id, provider: provider.name });
      return withRequestId(Response.json({ error: error.message, requestId: id }, { status: 401 }), id);
    }
    logger.warn('payment_webhook_unreadable', { requestId: id, provider: provider.name });
    return withRequestId(Response.json({ error: 'Unreadable notification.', requestId: id }, { status: 400 }), id);
  }
  if (!notified) return withRequestId(Response.json({ received: true }), id);
  let verified;
  try {
    verified = await provider.verify(notified);
  } catch (error) {
    logger.error('payment_provider_verification_failed', error, { requestId: id, provider: provider.name });
    return withRequestId(Response.json({ error: 'Could not verify the payment notification.', requestId: id }, { status: 502 }), id);
  }
  if (!verified) return withRequestId(Response.json({ error: 'The provider has no final outcome yet.', requestId: id }, { status: 409 }), id);
  if (verified.reference.startsWith(subscriptionReferencePrefix)) {
    const { data: until, error: subscriptionError } = await createAdminSupabase().rpc('confirm_subscription_payment', {
      p_provider: provider.name,
      p_reference: verified.reference,
      p_status: verified.status,
      p_amount_ghs: verified.amountGhs,
      p_event: verified.event as Json,
    });
    if (subscriptionError) {
      if (subscriptionError.code === '22023') return withRequestId(Response.json({ error: subscriptionError.message, requestId: id }, { status: 422 }), id);
      logger.error('confirm_subscription_payment_failed', subscriptionError, { requestId: id, provider: provider.name });
      return withRequestId(Response.json({ error: 'Could not record the payment.', requestId: id }, { status: 500 }), id);
    }
    after(() => dispatchNotifications());
    logger.info('subscription_webhook_recorded', { requestId: id, provider: provider.name, paidUntil: until });
    return withRequestId(Response.json({ received: true, paidUntil: until }), id);
  }
  const { data, error } = await createAdminSupabase().rpc('confirm_payment', {
    p_provider: provider.name,
    p_reference: verified.reference,
    p_status: verified.status,
    p_amount_ghs: verified.amountGhs,
    p_event: verified.event as Json,
  }).single();
  if (error) {
    if (error.code === '22023') return withRequestId(Response.json({ error: error.message, requestId: id }, { status: 422 }), id);
    logger.error('confirm_payment_failed', error, { requestId: id, provider: provider.name });
    return withRequestId(Response.json({ error: 'Could not record the payment.', requestId: id }, { status: 500 }), id);
  }
  after(() => dispatchNotifications());
  logger.info('payment_webhook_recorded', { requestId: id, provider: provider.name, orderStatus: data.order_status, paymentStatus: data.payment_status });
  return withRequestId(Response.json({ received: true, orderStatus: data.order_status, paymentStatus: data.payment_status }), id);
}
