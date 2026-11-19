import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Reorder suggestions' };

const urgencyLabels = {
  out: ['Sold out', 'bad'],
  now: ['Order now', 'bad'],
  soon: ['Order soon', 'warn'],
  low: ['Low stock', 'warn'],
  ok: ['Fine', 'good'],
} as const;
type Urgency = keyof typeof urgencyLabels;

const filters = { all: 'Everything to order', urgent: 'Order now or sold out' } as const;
type Filter = keyof typeof filters;

export default async function ReorderPage({ searchParams }: PageProps<'/admin/inventory/reorder'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const filter: Filter = params.show === 'urgent' ? 'urgent' : 'all';

  const [{ data: rows, error }, { data: settings }] = await Promise.all([
    staff.supabase.rpc('admin_reorder_suggestions'),
    staff.supabase.from('store_settings').select('reorder_lead_days, reorder_cover_days').single(),
  ]);
  if (error) throw error;
  const shown = rows.filter((r) => (filter === 'urgent' ? r.urgency === 'out' || r.urgency === 'now' : true));
  const toOrder = shown.reduce((n, r) => n + r.suggested_qty, 0);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Reorder suggestions</h1>
          <p className={styles.muted}>
            From the last 30 days of sales and the stock available now. A new order takes about {settings?.reorder_lead_days ?? 7} days to
            arrive, and a suggestion covers {settings?.reorder_cover_days ?? 21} days of sales after that
            {can(staff.role, 'settings.edit') ? (
              <>
                {' '}
                (change both in <Link href="/admin/settings">Settings</Link>)
              </>
            ) : null}
            .
          </p>
        </div>
        <div className={styles.buttons}>
          <Link href="/admin/inventory" className={styles.secondary}>Inventory</Link>
          <a href="/admin/inventory/reorder/export" className={styles.secondary} download>Export (CSV)</a>
        </div>
      </div>

      <nav className={styles.tabs} aria-label="Filter suggestions">
        {(Object.keys(filters) as Filter[]).map((key) => (
          <Link key={key} href={`/admin/inventory/reorder?show=${key}`} aria-current={key === filter ? 'page' : undefined}>
            {filters[key]}
          </Link>
        ))}
      </nav>

      <section className={styles.panel}>
        <p className={styles.muted}>
          {shown.length} item{shown.length === 1 ? '' : 's'}, {toOrder} unit{toOrder === 1 ? '' : 's'} suggested. These are suggestions from sales
          history only: they don’t know about a promotion, a season or an order already on its way.
        </p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col" className={styles.num}>Available</th>
                <th scope="col" className={styles.num}>Sold (last {rows[0]?.window_days ?? 30} days)</th>
                <th scope="col" className={styles.num}>Per day</th>
                <th scope="col" className={styles.num}>Days left</th>
                <th scope="col" className={styles.num}>Order</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const [label, tone] = urgencyLabels[r.urgency as Urgency] ?? urgencyLabels.ok;
                return (
                  <tr key={`${r.product_id}|${r.size_code}`}>
                    <td>
                      <Link href={`/admin/products/${r.product_id}`}>{r.product_name}</Link>
                      <div className={styles.muted}>
                        {[r.size_label, r.category_name, r.next_expiry ? `next expiry ${r.next_expiry}` : null].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className={styles.num}>{r.available}</td>
                    <td className={styles.num}>{r.sold_in_window}</td>
                    <td className={styles.num}>{r.daily_rate}</td>
                    <td className={styles.num}>{r.days_left ?? '–'}</td>
                    <td className={styles.num}>
                      <strong>{r.suggested_qty}</strong>
                    </td>
                    <td>
                      <span className={styles.badge} data-tone={tone}>{label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className={styles.empty}>Nothing to reorder right now.</p>}
        </div>
      </section>
    </>
  );
}
