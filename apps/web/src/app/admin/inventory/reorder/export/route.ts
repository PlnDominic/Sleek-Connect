import { toCsv } from '@/lib/admin/csv';
import { getStaffSession } from '@/lib/admin/session';

/** The reorder suggestions as a CSV to send to a supplier or keep with the purchase order. */
export async function GET() {
  const session = await getStaffSession();
  if (session.state !== 'ready') return new Response('Staff sign-in required.', { status: 401 });
  const { data, error } = await session.supabase.rpc('admin_reorder_suggestions');
  if (error) return new Response('Could not export.', { status: 500 });
  const rows: (string | number | boolean | null)[][] = [
    ['product', 'size', 'category', 'available', 'sold_last_period', 'days_in_period', 'per_day', 'days_left', 'suggested_order', 'status', 'next_expiry'],
    ...data.map((r) => [r.product_name, r.size_label ?? '', r.category_name, r.available, r.sold_in_window, r.window_days, r.daily_rate, r.days_left, r.suggested_qty, r.urgency, r.next_expiry]),
  ];
  const day = new Date().toISOString().slice(0, 10);
  return new Response(toCsv(rows), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="reorder-suggestions-${day}.csv"`, 'Cache-Control': 'no-store' },
  });
}
