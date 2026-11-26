import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDate, formatDateTime } from '@/lib/orders';
import { ActionForm } from '../../ActionForm';
import { deleteSupplierPayment, recordSupplierPayment } from '../actions';
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
  const money = can(staff.role, 'profit.view');
  const [{ data: list }, { data: history, error }, { data: balanceRows }, { data: paymentRows }] = await Promise.all([
    staff.supabase.rpc('admin_list_suppliers'),
    staff.supabase.rpc('admin_supplier_history', { p_id: id }),
    money ? staff.supabase.rpc('admin_supplier_balances') : Promise.resolve({ data: null }),
    money ? staff.supabase.rpc('admin_supplier_payments', { p_supplier_id: id }) : Promise.resolve({ data: null }),
  ]);
  const supplier = ((list ?? []) as unknown as { id: string; name: string }[]).find((s) => s.id === id);
  if (!supplier || error) notFound();
  const rows = (history ?? []) as unknown as Delivery[];
  const balance = ((balanceRows ?? []) as unknown as { supplier_id: string; received_cost_ghs: number; units_without_cost: number; paid_ghs: number; owed_ghs: number }[]).find((b) => b.supplier_id === id);
  const payments = (paymentRows ?? []) as unknown as { id: string; amount_ghs: number; paid_on: string; method: string; reference: string | null; note: string | null; recorded_by: string | null }[];

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
      {money && balance && (
        <section className={styles.panel} aria-labelledby="owed-title">
          <h2 id="owed-title">What we owe</h2>
          <p>
            Received <strong>{formatPrice(Number(balance.received_cost_ghs))}</strong> · paid <strong>{formatPrice(Number(balance.paid_ghs))}</strong> · owed{' '}
            <strong>{formatPrice(Number(balance.owed_ghs))}</strong>
          </p>
          {balance.units_without_cost > 0 && (
            <p className={styles.muted}>{balance.units_without_cost} delivered units have no cost recorded, so they are not counted here.</p>
          )}
          <ActionForm action={recordSupplierPayment.bind(null, id)} resetOnSuccess>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Amount paid (GH₵)</span>
                <input name="amount" inputMode="decimal" required />
              </label>
              <label className={styles.field}>
                <span>Date</span>
                <input name="paid_on" type="date" />
              </label>
              <label className={styles.field}>
                <span>How</span>
                <select name="method" defaultValue="momo">
                  <option value="momo">Mobile Money</option>
                  <option value="bank">Bank</option>
                  <option value="cash">Cash</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Reference (optional)</span>
                <input name="reference" maxLength={120} />
              </label>
            </div>
            <div className={styles.buttons}>
              <button type="submit" className={styles.primary}>
                Record payment
              </button>
            </div>
          </ActionForm>
          {payments.length > 0 && (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Paid</th>
                    <th className={styles.num}>Amount</th>
                    <th>How</th>
                    <th>Reference</th>
                    <th>By</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p) => (
                    <tr key={p.id}>
                      <td>{formatDate(p.paid_on)}</td>
                      <td className={styles.num}>{formatPrice(Number(p.amount_ghs))}</td>
                      <td>{p.method}</td>
                      <td>{p.reference ?? '–'}</td>
                      <td>{p.recorded_by ?? '–'}</td>
                      <td>
                        <ActionForm action={deleteSupplierPayment.bind(null, p.id)} confirm="Remove this payment?">
                          <button type="submit" className={styles.secondary}>
                            Remove
                          </button>
                        </ActionForm>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
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
