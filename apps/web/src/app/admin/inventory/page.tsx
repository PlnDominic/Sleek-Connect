import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { ReceiveForm } from './ReceiveForm';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Inventory' };

const filters = { all: 'All stock', low: 'Low stock', expiring: 'Expiring soon', oversold: 'Short' } as const;
type Filter = keyof typeof filters;

export default async function InventoryPage({ searchParams }: PageProps<'/admin/inventory'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const filter: Filter = typeof params.show === 'string' && params.show in filters ? (params.show as Filter) : 'all';

  const [{ data: levels, error }, { data: expiring }, { data: products }] = await Promise.all([
    staff.supabase.rpc('admin_stock_overview'),
    staff.supabase.rpc('admin_expiring_batches'),
    staff.supabase.from('products').select('id, department, kids_filter'),
  ]);
  if (error) throw error;
  const cosmetic = new Set((products ?? []).filter((p) => p.department === 'beauty' || p.kids_filter === 'bath').map((p) => p.id));

  const shown = levels.filter((l) =>
    filter === 'low' ? l.is_low : filter === 'expiring' ? l.expiring_soon : filter === 'oversold' ? l.available < 0 : true,
  );
  const skus = levels.map((l) => ({
    value: `${l.product_id}|${l.size_code}`,
    label: `${l.product_name}${l.size_label ? `, ${l.size_label}` : ''}`,
    needsExpiry: cosmetic.has(l.product_id),
  }));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Inventory</h1>
          <p className={styles.muted}>
            Available = on hand minus units held for unpaid orders. Every change is logged with who, when and why.
          </p>
        </div>
        <div className={styles.buttons}>
          <Link href="/admin/inventory/movements" className={styles.secondary}>Stock movements</Link>
          <a href="/admin/inventory/export?type=alerts" className={styles.secondary} download>Export alerts (CSV)</a>
        </div>
      </div>

      {can(staff.role, 'stock.edit') && (
        <details className={styles.panel}>
          <summary><strong>Receive stock</strong></summary>
          <ReceiveForm skus={skus} />
        </details>
      )}

      {(expiring ?? []).length > 0 && (
        <section className={styles.panel} aria-labelledby="expiring-title">
          <h2 id="expiring-title">Expiry alerts</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Batch</th>
                  <th scope="col">Expires</th>
                  <th scope="col" className={styles.num}>Units</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {(expiring ?? []).map((b) => (
                  <tr key={b.batch_id} data-alert={b.status === 'expired' || undefined}>
                    <td>
                      <Link href={`/admin/inventory/${b.product_id}`}>{b.product_name}</Link>
                      {b.size_label && <span className={styles.muted}> · {b.size_label}</span>}
                    </td>
                    <td>{b.batch_code}</td>
                    <td>{b.expires_on}</td>
                    <td className={styles.num}>{b.quantity}</td>
                    <td>
                      {b.status === 'expired' ? (
                        <span className={styles.badge} data-tone="bad">Expired: write off</span>
                      ) : (
                        <span className={styles.badge} data-tone="warn">{b.days_left} days left</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <nav className={styles.tabs} aria-label="Filter stock">
        {(Object.keys(filters) as Filter[]).map((key) => (
          <Link key={key} href={`/admin/inventory?show=${key}`} aria-current={key === filter ? 'page' : undefined}>
            {filters[key]}
          </Link>
        ))}
      </nav>
      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Product</th>
                <th scope="col">Size</th>
                <th scope="col" className={styles.num}>On hand</th>
                <th scope="col" className={styles.num}>Held</th>
                <th scope="col" className={styles.num}>Available</th>
                <th scope="col" className={styles.num}>Alert at</th>
                <th scope="col">Next expiry</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={`${l.product_id}-${l.size_code}`} data-alert={l.is_low || undefined}>
                  <td>
                    <Link href={`/admin/inventory/${l.product_id}`}>{l.product_name}</Link>
                    {!l.is_published && <span className={styles.muted}> · not on store</span>}
                  </td>
                  <td>{l.size_label ?? 'One size'}</td>
                  <td className={styles.num}>{l.on_hand}</td>
                  <td className={styles.num}>{l.reserved}</td>
                  <td className={styles.num}>
                    {l.available < 0 ? (
                      <span className={styles.badge} data-tone="bad">Short {-l.available}</span>
                    ) : l.is_low ? (
                      <span className={styles.badge} data-tone="warn">{l.available}</span>
                    ) : (
                      l.available
                    )}
                  </td>
                  <td className={styles.num}>{l.low_stock_threshold}</td>
                  <td>
                    {l.next_expiry ?? '–'}
                    {l.expiring_soon && <span className={styles.badge} data-tone="warn"> soon</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className={styles.empty}>Nothing to show.</p>}
        </div>
      </section>
    </>
  );
}
