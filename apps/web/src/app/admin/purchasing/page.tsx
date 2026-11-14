import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDate } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { Flash } from '../Flash';
import { reorderToPurchaseOrder } from './actions';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Purchasing' };

export const statusLabels: Record<string, [string, 'good' | 'warn' | 'bad' | undefined]> = {
  draft: ['Draft', undefined],
  ordered: ['Ordered', 'warn'],
  part_received: ['Part received', 'warn'],
  received: ['Received', 'good'],
  cancelled: ['Cancelled', 'bad'],
};
const tabs = { open: 'Open', all: 'All', received: 'Received', cancelled: 'Cancelled' } as const;
type Tab = keyof typeof tabs;

interface Row {
  id: string;
  number: string;
  status: string;
  supplier_name: string;
  expected_on: string | null;
  lines: number;
  units_ordered: number;
  units_received: number;
  total_cost_ghs: number;
}

export default async function PurchasingPage({ searchParams }: PageProps<'/admin/purchasing'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'purchasing.view')) return <p className={styles.notice}>Only operations, finance and admin staff can see purchase orders.</p>;
  const params = await searchParams;
  const tab: Tab = typeof params.show === 'string' && params.show in tabs ? (params.show as Tab) : 'open';
  const edit = can(staff.role, 'purchasing.edit');
  const [{ data, error }, { data: supplierRows }] = await Promise.all([
    staff.supabase.rpc('admin_list_purchase_orders'),
    staff.supabase.rpc('admin_supplier_options'),
  ]);
  if (error) return <p className={styles.notice}>Purchasing isn’t available yet. The latest database update hasn’t been applied.</p>;
  const all = (data ?? []) as unknown as Row[];
  const rows = all.filter((r) => (tab === 'open' ? ['draft', 'ordered', 'part_received'].includes(r.status) : tab === 'all' ? true : r.status === tab));
  const suppliers = (supplierRows ?? []) as unknown as { id: string; name: string }[];

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Purchasing</h1>
          <p className={styles.muted}>Orders to suppliers. When the goods arrive, receive them here and they go into stock with their batch, expiry and cost.</p>
        </div>
        {edit && (
          <div className={styles.buttons}>
            <Link href="/admin/inventory/reorder" className={styles.secondary}>Reorder suggestions</Link>
            <Link href="/admin/purchasing/new" className={styles.primary}>New purchase order</Link>
          </div>
        )}
      </div>
      <Flash message={params.done} />
      {edit && suppliers.length > 0 && (
        <section className={styles.panel} aria-labelledby="reorder-title">
          <h2 id="reorder-title">Order what’s running low</h2>
          <p className={styles.muted}>Makes a draft order from the reorder suggestions for the products a supplier usually provides. You check it before it is placed.</p>
          <ActionForm action={reorderToPurchaseOrder}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Supplier</span>
                <select name="supplier_id" required defaultValue="">
                  <option value="" disabled>
                    Choose…
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className={styles.buttons}>
              <button type="submit" className={styles.secondary}>Create draft order</button>
            </div>
          </ActionForm>
        </section>
      )}
      <nav className={styles.tabs} aria-label="Filter orders">
        {(Object.keys(tabs) as Tab[]).map((key) => (
          <Link key={key} href={`/admin/purchasing?show=${key}`} aria-current={key === tab ? 'page' : undefined}>
            {tabs[key]}
          </Link>
        ))}
      </nav>
      <section className={styles.panel}>
        {rows.length === 0 ? (
          <p className={styles.empty}>No purchase orders here.</p>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Supplier</th>
                  <th>Status</th>
                  <th className={styles.num}>Received</th>
                  <th className={styles.num}>Total</th>
                  <th>Expected</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const [label, tone] = statusLabels[r.status] ?? [r.status, undefined];
                  return (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/admin/purchasing/${r.id}`}>{r.number}</Link>
                      </td>
                      <td>{r.supplier_name}</td>
                      <td>
                        <span className={styles.badge} data-tone={tone}>{label}</span>
                      </td>
                      <td className={styles.num}>
                        {r.units_received} / {r.units_ordered}
                      </td>
                      <td className={styles.num}>{formatPrice(Number(r.total_cost_ghs))}</td>
                      <td>{r.expected_on ? formatDate(r.expected_on) : '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
