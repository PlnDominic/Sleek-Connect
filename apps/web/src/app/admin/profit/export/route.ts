import { can, getStaffSession } from '@/lib/admin/session';

const csv = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
const day = (offset: number) => new Date(new Date().getTime() - offset * 86_400_000).toISOString().slice(0, 10);

/** The profit report as a CSV (finance and admin only). */
export async function GET(request: Request) {
  const session = await getStaffSession();
  if (session.state !== 'ready') return new Response('Staff sign-in required.', { status: 401 });
  if (!can(session.role, 'profit.view')) return new Response('Not allowed', { status: 403 });
  const raw = new URL(request.url).searchParams.get('days');
  const days = raw && ['7', '30', '90', '365'].includes(raw) ? Number(raw) : 30;
  const { data, error } = await session.supabase.rpc('admin_profit_by_product', { p_from: day(days - 1), p_to: day(0) });
  if (error) return new Response('The report is not available', { status: 500 });
  const rows = (data ?? []) as unknown as Record<string, unknown>[];
  const body = [
    ['Product', 'Units', 'Sales (GHS)', 'Cost (GHS)', 'Profit (GHS)', 'Margin %', 'Units with known cost'].map(csv).join(','),
    ...rows.map((r) => [r.product_name, r.units, r.revenue_ghs, r.cost_ghs, r.margin_ghs, r.margin_pct, r.units_cost_known].map(csv).join(',')),
  ].join('\n');
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="profit-${day(0)}.csv"`, 'cache-control': 'no-store' } });
}
