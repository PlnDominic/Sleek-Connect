import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { getVendorSession } from '@/lib/vendor';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Sales reports' };

interface Report {
  days: { date: string; units: number; revenue: number; orders: number }[];
  totals: { units: number; revenue: number; orders: number; views?: number };
  top_products: { name: string; units: number; revenue: number }[];
  product_stats?: { name: string; views: number; orders: number; units: number; revenue: number; conversion: number | null }[];
}

const periods = [7, 30, 90] as const;

export default async function VendorReportsPage({ searchParams }: PageProps<'/vendor/reports'>) {
  const params = await searchParams;
  const asked = Number(Array.isArray(params.days) ? params.days[0] : params.days);
  const days = periods.find((p) => p === asked) ?? 30;
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const { data, error } = await session.supabase.rpc('vendor_report', { p_days: days });
  if (error) throw error;
  const report = data as unknown as Report;
  const peak = Math.max(1, ...report.days.map((d) => d.revenue));

  return (
    <>
      <nav className={styles.periods} aria-label="Period">
        {periods.map((p) => (
          <Link key={p} href={`/vendor/reports?days=${p}`} aria-current={p === days ? 'page' : undefined}>
            Last {p} days
          </Link>
        ))}
      </nav>
      <div className={styles.stats}>
        <section className={styles.stat}>
          <h2>Sales</h2>
          <strong>{formatPrice(report.totals.revenue)}</strong>
          <span>Your share of paid orders</span>
        </section>
        <section className={styles.stat}>
          <h2>Items sold</h2>
          <strong>{report.totals.units}</strong>
          <span>Across {report.totals.orders} order{report.totals.orders === 1 ? '' : 's'}</span>
        </section>
        {report.totals.views !== undefined && (
          <section className={styles.stat}>
            <h2>Product views</h2>
            <strong>{report.totals.views}</strong>
            <span>
              {report.totals.views > 0 ? `${((report.totals.orders * 100) / report.totals.views).toFixed(1)}% of views became an order` : 'Views of your product pages'}
            </span>
          </section>
        )}
      </div>

      <section className={styles.panel}>
        <h2>Sales by day</h2>
        <div className={styles.chart} role="img" aria-label={`Daily sales for the last ${days} days`}>
          {report.days.map((d) => (
            <div
              key={d.date}
              className={styles.bar}
              data-empty={d.revenue === 0 || undefined}
              style={{ height: `${Math.max(2, (d.revenue / peak) * 100)}%` }}
              title={`${d.date}: ${formatPrice(d.revenue)} · ${d.units} item${d.units === 1 ? '' : 's'}`}
            />
          ))}
        </div>
        <div className={styles.chartAxis}>
          <span>{report.days[0]?.date}</span>
          <span>{report.days[report.days.length - 1]?.date}</span>
        </div>
      </section>

      {report.product_stats && report.product_stats.length > 0 && (
        <section className={styles.panel}>
          <h2>Views and conversion by product</h2>
          <p className={styles.muted}>Conversion is orders divided by views. A product with many views and few orders may need better photos, a clearer description or a different price.</p>
          <ul className={styles.list}>
            {report.product_stats.map((p) => (
              <li key={p.name} className={styles.listRow}>
                <span className={styles.listMain}>
                  {p.name}
                  <small>
                    {p.views} view{p.views === 1 ? '' : 's'} · {p.orders} order{p.orders === 1 ? '' : 's'}
                    {p.conversion !== null ? ` · ${p.conversion}% converted` : ''}
                  </small>
                </span>
                <span className={styles.amount}>{formatPrice(p.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={styles.panel}>
        <h2>Best sellers</h2>
        {report.top_products.length === 0 ? (
          <p className={styles.muted}>No sales in this period yet.</p>
        ) : (
          <ul className={styles.list}>
            {report.top_products.map((p) => (
              <li key={p.name} className={styles.listRow}>
                <span className={styles.listMain}>
                  {p.name}
                  <small>
                    {p.units} sold
                  </small>
                </span>
                <span className={styles.amount}>{formatPrice(p.revenue)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
