import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Profit' };

const ranges = { '7': 'Last 7 days', '30': 'Last 30 days', '90': 'Last 90 days', '365': 'Last year' } as const;

export interface ProfitRow {
  product_id: string;
  product_name: string;
  units: number;
  revenue_ghs: number;
  cost_ghs: number;
  margin_ghs: number | null;
  margin_pct: number | null;
  units_cost_known: number;
}

export const isoDay = (offset: number) => new Date(new Date().getTime() - offset * 86_400_000).toISOString().slice(0, 10);

export default async function ProfitPage({ searchParams }: PageProps<'/admin/profit'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'profit.view')) return <p className={styles.notice}>Only finance staff and admins can see profit.</p>;
  const { days: raw } = await searchParams;
  const days = typeof raw === 'string' && raw in ranges ? raw : '30';
  const [{ data, error }, { data: valueRows }] = await Promise.all([
    staff.supabase.rpc('admin_profit_by_product', { p_from: isoDay(Number(days) - 1), p_to: isoDay(0) }),
    staff.supabase.rpc('admin_stock_value'),
  ]);
  if (error) return <p className={styles.notice}>The profit report isn’t available yet. The latest database update hasn’t been applied.</p>;
  const rows = (data ?? []) as unknown as ProfitRow[];
  const value = ((valueRows ?? []) as unknown as { value_ghs: number; units: number; units_without_cost: number }[])[0];

  const revenue = rows.reduce((n, r) => n + Number(r.revenue_ghs), 0);
  const cost = rows.reduce((n, r) => n + Number(r.cost_ghs), 0);
  const units = rows.reduce((n, r) => n + Number(r.units), 0);
  const known = rows.reduce((n, r) => n + Number(r.units_cost_known), 0);
  // Margin on the units whose cost is known (the same basis as the per-product margin).
  const marginKnown = rows.reduce((n, r) => n + Number(r.margin_ghs ?? 0), 0);
  const revenueKnown = rows.reduce((n, r) => n + (r.margin_ghs === null ? 0 : Number(r.margin_ghs) + Number(r.cost_ghs)), 0);
  const marginPct = revenueKnown > 0 ? Math.round((marginKnown / revenueKnown) * 1000) / 10 : null;
  const coverage = units > 0 ? Math.round((known / units) * 100) : null;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Profit</h1>
          <p className={styles.muted}>
            Items on paid orders, before discounts and delivery fees, against what the stock they were packed from cost. Cancelled and returned orders are left out.
          </p>
        </div>
        <div className={styles.buttons}>
          {Object.entries(ranges).map(([value, label]) => (
            <Link key={value} href={`/admin/profit?days=${value}`} className={value === days ? styles.primary : styles.secondary}>
              {label}
            </Link>
          ))}
          <a href={`/admin/profit/export?days=${days}`} className={styles.secondary} download>
            Export (CSV)
          </a>
        </div>
      </div>

      <section className={styles.cards} aria-label="Summary">
        <div className={styles.panel}>
          <h2>Sales</h2>
          <strong>{formatPrice(revenue)}</strong>
          <p className={styles.muted}>{units} units sold</p>
        </div>
        <div className={styles.panel}>
          <h2>Cost of goods</h2>
          <strong>{formatPrice(cost)}</strong>
          <p className={styles.muted}>{coverage === null ? 'Nothing sold yet' : `Cost known for ${coverage}% of units`}</p>
        </div>
        <div className={styles.panel}>
          <h2>Profit</h2>
          <strong>{formatPrice(marginKnown)}</strong>
          <p className={styles.muted}>{marginPct === null ? 'No cost recorded yet' : `${marginPct}% margin`}</p>
        </div>
        <div className={styles.panel}>
          <h2>Stock on the shelves</h2>
          <strong>{formatPrice(Number(value?.value_ghs ?? 0))}</strong>
          <p className={styles.muted}>
            {value?.units ?? 0} units at cost{value && value.units_without_cost > 0 ? `, ${value.units_without_cost} with no cost recorded` : ''}
          </p>
        </div>
      </section>
      {coverage !== null && coverage < 100 && (
        <p className={styles.notice}>
          Some units were sold from stock received before costs were recorded, so their profit is not counted. Receive new stock with a cost (Inventory → Receive stock, or a
          purchase order) and the figures become complete.
        </p>
      )}

      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.empty}>No paid orders in this period.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className={styles.num}>Units</th>
                  <th className={styles.num}>Sales</th>
                  <th className={styles.num}>Cost</th>
                  <th className={styles.num}>Profit</th>
                  <th className={styles.num}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.product_id ?? r.product_name}>
                    <td>{r.product_name}</td>
                    <td className={styles.num}>{r.units}</td>
                    <td className={styles.num}>{formatPrice(Number(r.revenue_ghs))}</td>
                    <td className={styles.num}>{r.units_cost_known > 0 ? formatPrice(Number(r.cost_ghs)) : '–'}</td>
                    <td className={styles.num}>{r.margin_ghs === null || r.units_cost_known === 0 ? '–' : formatPrice(Number(r.margin_ghs))}</td>
                    <td className={styles.num}>{r.margin_pct === null ? '–' : `${r.margin_pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
