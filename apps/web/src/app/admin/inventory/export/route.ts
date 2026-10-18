import { toCsv } from '@/lib/admin/csv';
import { getStaffSession } from '@/lib/admin/session';
import { UUID_PATTERN } from '@/lib/orders';

/** CSV exports for staff: stock alerts (PRD FR-103 "alert list exportable") and the movement ledger. */
export async function GET(request: Request) {
  const session = await getStaffSession();
  if (session.state !== 'ready') return new Response('Staff sign-in required.', { status: 401 });
  const db = session.supabase;
  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const day = new Date().toISOString().slice(0, 10);

  let rows: (string | number | boolean | null)[][];
  if (type === 'alerts') {
    const [{ data: levels, error }, { data: batches, error: error2 }] = await Promise.all([
      db.rpc('admin_stock_overview'),
      db.rpc('admin_expiring_batches'),
    ]);
    if (error || error2) return new Response('Could not export.', { status: 500 });
    rows = [
      ['alert', 'product', 'size', 'batch', 'available', 'threshold', 'expires_on', 'units', 'status'],
      ...levels
        .filter((l) => l.is_low)
        .map((l) => ['low stock', l.product_name, l.size_label ?? '', '', l.available, l.low_stock_threshold, l.next_expiry, '', '']),
      ...batches.map((b) => [
        b.status === 'expired' ? 'expired' : 'expiring soon',
        b.product_name,
        b.size_label ?? '',
        b.batch_code,
        '',
        '',
        b.expires_on,
        b.quantity,
        b.status,
      ]),
    ];
  } else if (type === 'movements') {
    let query = db
      .from('stock_movements')
      .select('at, size_code, reason, quantity, sellable_change, actor_email, note, products(name), stock_batches(batch_code), orders(order_number)')
      .order('at', { ascending: false })
      .limit(10000);
    const product = url.searchParams.get('product');
    if (product && UUID_PATTERN.test(product)) query = query.eq('product_id', product);
    const { data, error } = await query;
    if (error) return new Response('Could not export.', { status: 500 });
    rows = [
      ['at', 'product', 'size', 'batch', 'reason', 'units', 'for_sale_change', 'order', 'by', 'note'],
      ...data.map((m) => [
        m.at,
        m.products?.name ?? '',
        m.size_code,
        m.stock_batches?.batch_code ?? '',
        m.reason,
        m.quantity,
        m.sellable_change,
        m.orders?.order_number ?? '',
        m.actor_email ?? 'system',
        m.note ?? '',
      ]),
    ];
  } else {
    return new Response('Unknown export.', { status: 400 });
  }

  return new Response(toCsv(rows), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="sleek-connect-${type}-${day}.csv"`,
    },
  });
}
