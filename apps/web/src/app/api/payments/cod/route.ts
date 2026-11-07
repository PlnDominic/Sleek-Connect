import { after } from 'next/server';
import { alertStoreNewOrder, dispatchNotifications } from '@/lib/notifications/dispatch';
import { UUID_PATTERN } from '@/lib/orders';
import { logger, requestId, withRequestId } from '@/lib/observability';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { createAdminSupabase } from '@/lib/supabase/admin';

/**
 * Pay on delivery orders placed from the mobile app: nothing to charge, but the shopper's "order received" email is waiting
 * to be sent and the store should hear about the order, exactly as for an order placed on the website. Only an order that
 * really is pay on delivery and still waiting for confirmation is accepted.
 */
export async function POST(request: Request) {
  const id = requestId(request);
  const limit = rateLimit({ key: `payment-cod:${clientAddress(request)}`, limit: 20, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);

  const body = (await request.json().catch(() => null)) as { orderToken?: unknown } | null;
  const token = typeof body?.orderToken === 'string' ? body.orderToken : '';
  if (!UUID_PATTERN.test(token)) {
    return withRequestId(Response.json({ ok: false, requestId: id }, { status: 400 }), id);
  }

  const { data, error } = await createAdminSupabase()
    .from('orders')
    .select('order_number, status, payment_method, total_ghs, customer_name, phone, area')
    .eq('public_token', token)
    .maybeSingle();
  if (error) {
    logger.error('cod_notify_lookup_failed', error, { requestId: id });
    return withRequestId(Response.json({ ok: false, requestId: id }, { status: 500 }), id);
  }
  if (!data || data.payment_method !== 'cod' || data.status !== 'pending_payment') {
    return withRequestId(Response.json({ ok: false, requestId: id }, { status: 409 }), id);
  }

  logger.info('order_placed', { orderNumber: data.order_number, source: 'app', payment: 'cod' });
  after(() => dispatchNotifications());
  after(() =>
    alertStoreNewOrder({
      orderNumber: data.order_number,
      total: data.total_ghs,
      customerName: data.customer_name,
      phone: data.phone,
      area: data.area,
      source: 'app',
      payment: 'cod',
    }),
  );
  return withRequestId(Response.json({ ok: true, requestId: id }, { headers: { 'Cache-Control': 'no-store' } }), id);
}
