import type { Metadata } from 'next';
import Link from 'next/link';
import { can, requireStaffPage } from '@/lib/admin/session';
import { Flash } from '../../Flash';
import { CountForm } from './CountForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Stock count' };

export default async function StockCountPage({ searchParams }: PageProps<'/admin/inventory/count'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'stock.edit')) return <p className={styles.notice}>Only operations staff and admins can count stock.</p>;
  const query = await searchParams;
  const [{ data: batches }, { data: levels }] = await Promise.all([
    staff.supabase
      .from('stock_batches')
      .select('id, product_id, size_code, batch_code, expires_on, quantity, status')
      .in('status', ['available', 'quarantined'])
      .gt('quantity', 0)
      .order('expires_on', { nullsFirst: false }),
    staff.supabase.rpc('admin_stock_overview'),
  ]);
  const names = new Map((levels ?? []).map((l) => [`${l.product_id}|${l.size_code}`, `${l.product_name}${l.size_label ? `, ${l.size_label}` : ''}`]));
  const rows = (batches ?? [])
    .map((b) => ({ id: b.id, product: names.get(`${b.product_id}|${b.size_code}`) ?? 'Product', batch: b.batch_code, expires: b.expires_on ?? '', quantity: b.quantity, status: b.status }))
    .sort((a, b) => a.product.localeCompare(b.product) || a.batch.localeCompare(b.batch));

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Stock count</h1>
          <p className={styles.muted}>
            Count the shelves and type the number for each batch you checked. Rows you leave empty are not touched. Where your count differs, the batch is corrected and
            the difference is recorded as found or lost, with your name, in the stock movements.
          </p>
        </div>
        <Link href="/admin/inventory" className={styles.secondary}>
          Inventory
        </Link>
      </div>
      <Flash message={query.done} />
      {rows.length === 0 ? <p className={styles.empty}>There is no stock to count yet.</p> : <CountForm batches={rows} />}
    </>
  );
}
