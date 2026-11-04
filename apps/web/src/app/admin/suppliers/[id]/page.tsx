import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Supplier deliveries' };

interface Delivery {
  at: string;
  product: string;
  slug: string;
  size: string;
  batch: string | null;
  quantity: number;
  unit_cost_ghs: number | null;
  reference: string | null;
  received_by: string | null;
}

export default async function SupplierHistoryPage({ params }: PageProps<'/admin/suppliers/[id]'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'suppliers.manage')) return <p className={styles.notice}>Only operations, finance and admin staff can see suppliers.</p>;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [{ data: list }, { data: history, error }] = await Promise.all([
    staff.supabase.rpc('admin_list_suppliers'),
    staff.supabase.rpc('admin_supplier_history', { p_id: id }),
  ]);
  const supplier = ((list ?? []) as unknown as { id: string; name: string }[]).find((s) => s.id === id);
  if (!supplier || error) notFound();
  const rows = (history ?? []) as unknown as Delivery[];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>{supplier.name}</h1>
          <p className={styles.muted}>Everything received from this supplier, newest first.</p>
        </div>
        <Link href="/admin/suppliers" className={styles.secondary}>
          All suppliers
        </Link>
      </div>
      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.empty}>Nothing received from this supplier yet. Choose them when you receive stock under Inventory.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Received</th>
                  <th>Product</th>
                  <th>Batch</th>
                  <th className={styles.num}>Units</th>
                  <th className={styles.num}>Cost each</th>
                  <th>Reference</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={`${r.at}-${i}`}>
                    <td>{formatDateTime(r.at)}</td>
                    <td>
                      <Link href={`/products/${r.slug}`}>{r.product}</Link>
                      <div className={styles.muted}>{r.size}</div>
                    </td>
                    <td>{r.batch ?? '–'}</td>
                    <td className={styles.num}>{r.quantity}</td>
                    <td className={styles.num}>{r.unit_cost_ghs === null ? '–' : formatPrice(Number(r.unit_cost_ghs))}</td>
                    <td>{r.reference ?? '–'}</td>
                    <td>{r.received_by ?? '–'}</td>
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
