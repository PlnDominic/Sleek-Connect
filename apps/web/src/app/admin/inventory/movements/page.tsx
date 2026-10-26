import type { Metadata } from 'next';
import Link from 'next/link';
import { requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { movementLabels } from '../labels';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Stock movements' };

export default async function MovementsPage({ searchParams }: PageProps<'/admin/inventory/movements'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const reason = (await searchParams).reason;
  let query = staff.supabase
    .from('stock_movements')
    .select('id, at, size_code, reason, quantity, sellable_change, actor_email, note, products(id, name), stock_batches(batch_code), orders(order_number)')
    .order('at', { ascending: false })
    .limit(300);
  if (typeof reason === 'string' && reason in movementLabels) query = query.eq('reason', reason as keyof typeof movementLabels);
  const { data: movements, error } = await query;
  if (error) throw error;

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Stock movements</h1>
          <p className={styles.muted}>Every stock change, newest first.</p>
        </div>
        <a href="/admin/inventory/export?type=movements" className={styles.secondary} download>Export all (CSV)</a>
      </div>
      <nav className={styles.tabs} aria-label="Filter by reason">
        <Link href="/admin/inventory/movements" aria-current={!reason ? 'page' : undefined}>All</Link>
        {Object.entries(movementLabels).map(([key, label]) => (
          <Link key={key} href={`/admin/inventory/movements?reason=${key}`} aria-current={key === reason ? 'page' : undefined}>
            {label}
          </Link>
        ))}
      </nav>
      <section className={styles.panel}>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Product</th>
                <th scope="col">What</th>
                <th scope="col">Batch</th>
                <th scope="col" className={styles.num}>Units</th>
                <th scope="col" className={styles.num}>For sale</th>
                <th scope="col">Who</th>
                <th scope="col">Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id}>
                  <td>{formatDateTime(m.at)}</td>
                  <td>
                    {m.products ? <Link href={`/admin/inventory/${m.products.id}`}>{m.products.name}</Link> : '–'}
                    {m.size_code && <span className={styles.muted}> · {m.size_code}</span>}
                  </td>
                  <td>
                    {movementLabels[m.reason]}
                    {m.orders && <div className={styles.muted}>Order {m.orders.order_number}</div>}
                  </td>
                  <td>{m.stock_batches?.batch_code ?? '–'}</td>
                  <td className={styles.num}>{m.quantity || '–'}</td>
                  <td className={styles.num}>{m.sellable_change || '–'}</td>
                  <td>{m.actor_email ?? 'system'}</td>
                  <td>{m.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {movements.length === 0 && <p className={styles.empty}>No movements.</p>}
        </div>
      </section>
    </>
  );
}
