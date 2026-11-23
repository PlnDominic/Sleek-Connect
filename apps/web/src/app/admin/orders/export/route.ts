import { getStaffSession } from '@/lib/admin/session';
import { toCsv } from '@/lib/admin/csv';
import { orderViews, type OrderView } from '../queries';

export async function GET(request: Request) {
  const session = await getStaffSession();
  if (session.state !== 'ready') return new Response('Staff sign-in required.', { status: 401 });

  const url = new URL(request.url);
  const requestedView = url.searchParams.get('view');
  const view: OrderView = requestedView && requestedView in orderViews ? (requestedView as OrderView) : 'to_pack';
  const config = orderViews[view];
  const q = (url.searchParams.get('q') ?? '').trim();
  let query = session.supabase
    .from('orders')
    .select('order_number, status, customer_name, phone, area, ghanapost_gps, delivery_option_id, subtotal_ghs, delivery_fee_ghs, total_ghs, payment_method, momo_network, created_at, paid_at, needs_review, refund_due, is_gift, order_items(quantity)')
    .limit(10000);
  if ('statuses' in config) query = query.in('status', [...config.statuses]);
  if ('flag' in config) query = query.eq(config.flag, true);
  if (q) {
    const term = q.replace(/[^\p{L}\p{N} +-]/gu, '');
    query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  query = query.order('created_at', { ascending: 'oldestFirst' in config });
  const { data, error } = await query;
  if (error) return new Response('Could not export orders.', { status: 500 });

  const rows: (string | number | boolean | null)[][] = [
    ['order_number', 'status', 'customer_name', 'phone', 'area', 'ghanapost_gps', 'delivery_option', 'items', 'subtotal_ghs', 'delivery_fee_ghs', 'total_ghs', 'payment_method', 'momo_network', 'created_at', 'paid_at', 'needs_review', 'refund_due', 'is_gift'],
    ...(data ?? []).map((order) => [
      order.order_number,
      order.status,
      order.customer_name,
      order.phone,
      order.area,
      order.ghanapost_gps,
      order.delivery_option_id,
      order.order_items.reduce((total, item) => total + item.quantity, 0),
      order.subtotal_ghs,
      order.delivery_fee_ghs,
      order.total_ghs,
      order.payment_method,
      order.momo_network,
      order.created_at,
      order.paid_at,
      order.needs_review,
      order.refund_due,
      order.is_gift,
    ]),
  ];
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sleek-connect-orders-${view}-${day}.csv"`,
    },
  });
}
