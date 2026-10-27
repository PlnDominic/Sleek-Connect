import { momoNetworks, type MomoNetwork } from '@sleek/shared';
import { startOrderPayment } from '@/lib/payments/start';
import { UUID_PATTERN } from '@/lib/orders';
import { logger, requestId, withRequestId } from '@/lib/observability';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createSupabase } from '@/lib/supabase/server';

/**
 * Sends the Mobile Money prompt for an order the mobile app has already placed (`place_order` runs from the app with
 * the publishable key; only the payment provider call needs the server). The amount is the one the database priced for
 * the order, never anything sent by the phone, and only an order still waiting for payment is accepted.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const limit = rateLimit({ key: `payment-start:${clientAddress(request)}`, limit: 20, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);

  const body = (await request.json().catch(() => null)) as { orderToken?: unknown; network?: unknown; wallet?: unknown } | null;
  const token = typeof body?.orderToken === 'string' ? body.orderToken : '';
  const network = momoNetworks.find((n) => n.id === body?.network)?.id as MomoNetwork | undefined;
  const wallet = typeof body?.wallet === 'string' ? body.wallet.replace(/[^\d+]/g, '') : '';
  if (!UUID_PATTERN.test(token) || !network || wallet.replace(/\D/g, '').length < 9 || wallet.length > 16) {
    return withRequestId(Response.json({ kind: 'failed', reason: 'Check the Mobile Money network and number.', requestId: id }, { status: 400 }), id);
  }

  const { data, error } = await createSupabase().rpc('get_order_status', { p_order_token: token }).maybeSingle();
  if (error) {
    logger.error('payment_start_lookup_failed', error, { requestId: id });
    return withRequestId(Response.json({ kind: 'failed', reason: 'We couldn’t start the payment. Please try again.', requestId: id }, { status: 500 }), id);
  }
  if (!data || data.status !== 'pending_payment') {
    return withRequestId(Response.json({ kind: 'failed', reason: 'This order isn’t waiting for payment.', requestId: id }, { status: 409 }), id);
  }

  const result = await startOrderPayment({ token, number: data.order_number, total: data.total_ghs }, { network, wallet });
  return withRequestId(Response.json({ ...result, requestId: id }, { headers: { 'Cache-Control': 'no-store' } }), id);
}
