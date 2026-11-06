import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { skuChoices, skuProductColumns } from '@/lib/admin/sku-options';
import { formatDate, UUID_PATTERN } from '@/lib/orders';
import { ActionForm } from '../../ActionForm';
import { Flash } from '../../Flash';
import { cancelPurchaseOrder, completePurchaseOrder, placePurchaseOrder } from '../actions';
import { statusLabels } from '../page';
import { PurchaseOrderForm } from '../PurchaseOrderForm';
import { ReceiveOrderForm } from '../ReceiveOrderForm';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Purchase order' };

interface Order {
  id: string;
  number: string;
  status: string;
  supplier_id: string;
  supplier_name: string;
  expected_on: string | null;
  ordered_at: string | null;
  note: string | null;
  created_by: string | null;
  lines: { id: string; product_id: string; product_name: string; size_code: string; size_label: string; quantity_ordered: number; quantity_received: number; unit_cost_ghs: number; needs_expiry: boolean }[];
}

export default async function PurchaseOrderPage({ params, searchParams }: PageProps<'/admin/purchasing/[id]'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  if (!can(staff.role, 'purchasing.view')) return <p className={styles.notice}>Only operations, finance and admin staff can see purchase orders.</p>;
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();
  const query = await searchParams;
  const { data, error } = await staff.supabase.rpc('admin_get_purchase_order', { p_id: id });
  if (error || !data) notFound();
  const order = data as unknown as Order;
  const edit = can(staff.role, 'purchasing.edit');
  const [label, tone] = statusLabels[order.status] ?? [order.status, undefined];
  const total = order.lines.reduce((n, l) => n + l.quantity_ordered * Number(l.unit_cost_ghs), 0);
  const nothingReceived = order.lines.every((l) => l.quantity_received === 0);

  let draftForm = null;
  if (edit && order.status === 'draft') {
    const [{ data: supplierRows }, { data: products }] = await Promise.all([
      staff.supabase.rpc('admin_supplier_options'),
      staff.supabase.from('products').select(skuProductColumns).order('name'),
    ]);
    draftForm = (
      <PurchaseOrderForm
        id={order.id}
        suppliers={(supplierRows ?? []) as unknown as { id: string; name: string }[]}
        skus={skuChoices(products ?? [])}
        initial={{
          supplier_id: order.supplier_id,
          expected_on: order.expected_on ?? '',
          note: order.note ?? '',
          lines: order.lines.map((l) => ({ sku: `${l.product_id}|${l.size_code}`, quantity: String(l.quantity_ordered), unit_cost_ghs: String(l.unit_cost_ghs) })),
        }}
      />
    );
  }
  const receivable = order.lines.filter((l) => l.quantity_ordered > l.quantity_received);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>
            {order.number} <span className={styles.badge} data-tone={tone}>{label}</span>
          </h1>
          <p className={styles.muted}>
            {order.supplier_name}
            {order.expected_on ? ` · expected ${formatDate(order.expected_on)}` : ''}
            {order.ordered_at ? ` · placed ${formatDate(order.ordered_at)}` : ''}
            {order.created_by ? ` · by ${order.created_by}` : ''}
          </p>
        </div>
        <Link href="/admin/purchasing" className={styles.secondary}>
          All orders
        </Link>
      </div>
      <Flash message={query.done} />

      {draftForm}
      {edit && order.status === 'draft' && (
        <section className={styles.panel}>
          <div className={styles.buttons}>
            <ActionForm action={placePurchaseOrder.bind(null, order.id)} confirm={`Place ${order.number} with ${order.supplier_name}?`}>
              <button type="submit" className={styles.primary}>Place order</button>
            </ActionForm>
            <ActionForm action={cancelPurchaseOrder.bind(null, order.id)} confirm="Cancel this draft?">
              <button type="submit" className={styles.secondary}>Cancel draft</button>
            </ActionForm>
          </div>
        </section>
      )}

      {order.status !== 'draft' && (
        <section className={styles.panel}>
          <h2>Products</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className={styles.num}>Ordered</th>
                  <th className={styles.num}>Received</th>
                  <th className={styles.num}>Cost each</th>
                  <th className={styles.num}>Line total</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((l) => (
                  <tr key={l.id}>
                    <td>
                      {l.product_name}
                      {l.size_label ? `, ${l.size_label}` : ''}
                    </td>
                    <td className={styles.num}>{l.quantity_ordered}</td>
                    <td className={styles.num}>{l.quantity_received}</td>
                    <td className={styles.num}>{formatPrice(Number(l.unit_cost_ghs))}</td>
                    <td className={styles.num}>{formatPrice(l.quantity_ordered * Number(l.unit_cost_ghs))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.muted}>
            Order total: <strong>{formatPrice(total)}</strong>
            {order.note ? ` · ${order.note}` : ''}
          </p>
        </section>
      )}

      {edit && (order.status === 'ordered' || order.status === 'part_received') && receivable.length > 0 && (
        <ReceiveOrderForm
          id={order.id}
          lines={receivable.map((l) => ({
            id: l.id,
            name: `${l.product_name}${l.size_label ? `, ${l.size_label}` : ''}`,
            remaining: l.quantity_ordered - l.quantity_received,
            needs_expiry: l.needs_expiry,
          }))}
        />
      )}
      {edit && (order.status === 'ordered' || order.status === 'part_received') && (
        <section className={styles.panel}>
          <div className={styles.buttons}>
            {order.status === 'part_received' && (
              <ActionForm action={completePurchaseOrder.bind(null, order.id)} confirm="Mark this order complete? The rest won't be received.">
                <button type="submit" className={styles.secondary}>Mark as complete</button>
              </ActionForm>
            )}
            {nothingReceived && (
              <ActionForm action={cancelPurchaseOrder.bind(null, order.id)} confirm="Cancel this order?">
                <button type="submit" className={styles.secondary}>Cancel order</button>
              </ActionForm>
            )}
          </div>
        </section>
      )}
    </>
  );
}
