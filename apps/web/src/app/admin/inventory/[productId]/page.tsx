import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime, UUID_PATTERN } from '@/lib/orders';
import { ActionForm } from '../../ActionForm';
import { Flash } from '../../Flash';
import { adjustBatch, setBatchStatus, writeOffBatch } from '../actions';
import { ReceiveForm } from '../ReceiveForm';
import { movementLabels } from '../labels';
import styles from '../../admin.module.css';

export const metadata: Metadata = { title: 'Stock and batches' };

const statusTone = { available: 'good', quarantined: 'warn', recalled: 'bad', expired: 'bad' } as const;

export default async function ProductStockPage({ params, searchParams }: PageProps<'/admin/inventory/[productId]'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { productId } = await params;
  if (!UUID_PATTERN.test(productId)) notFound();
  const { done } = await searchParams;
  const db = staff.supabase;

  const [{ data: product }, { data: levels }, { data: batches }, { data: movements }] = await Promise.all([
    db.from('products').select('id, name, department, kids_filter, product_sizes(code, label, sort_order)').eq('id', productId).maybeSingle(),
    db.rpc('admin_stock_overview'),
    db.from('stock_batches').select('id, size_code, batch_code, expires_on, quantity, status, received_at, note').eq('product_id', productId).order('expires_on', { nullsFirst: false }),
    db.from('stock_movements').select('id, at, size_code, batch_id, reason, quantity, sellable_change, actor_email, note, orders(order_number)').eq('product_id', productId).order('at', { ascending: false }).limit(100),
  ]);
  if (!product) notFound();

  const sizeLabel = (code: string) => product.product_sizes.find((s) => s.code === code)?.label ?? 'One size';
  const mine = (levels ?? []).filter((l) => l.product_id === productId);
  const batchCode = new Map((batches ?? []).map((b) => [b.id, b.batch_code]));
  const editStock = can(staff.role, 'stock.edit');
  const recall = can(staff.role, 'recall');
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>{product.name}</h1>
        </div>
        <Link href={`/admin/products/${product.id}`} className={styles.secondary}>
          Product details
        </Link>
      </div>

      <Flash message={done} />
      <div className={styles.cards}>
        {mine.map((l) => (
          <div key={l.size_code} className={styles.card} data-alert={l.is_low || undefined}>
            <span className={styles.muted}>{l.size_label ?? 'One size'}</span>
            <strong>{l.available}</strong>
            <span className={styles.muted}>
              available · {l.on_hand} on hand, {l.reserved} held
            </span>
          </div>
        ))}
      </div>

      {editStock && (
        <details className={styles.panel}>
          <summary><strong>Receive stock</strong></summary>
          <ReceiveForm
            skus={mine.map((l) => ({
              value: `${l.product_id}|${l.size_code}`,
              label: `${product.name}${l.size_label ? `, ${l.size_label}` : ''}`,
              needsExpiry: product.department === 'beauty' || product.kids_filter === 'bath',
            }))}
            defaultSku={mine.length === 1 ? `${productId}|${mine[0]?.size_code}` : undefined}
          />
        </details>
      )}

      <section className={styles.panel} aria-labelledby="batches-title">
        <h2 id="batches-title">Batches</h2>
        <p className={styles.muted}>Orders are packed from the batch that expires first.</p>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Batch</th>
                <th scope="col">Expires</th>
                <th scope="col" className={styles.num}>Units</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {(batches ?? []).map((b) => (
                <tr key={b.id}>
                  <td>
                    <strong>{b.batch_code}</strong>
                    <div className={styles.muted}>
                      {sizeLabel(b.size_code)} · received {formatDateTime(b.received_at)}
                      {b.note && ` · ${b.note}`}
                    </div>
                  </td>
                  <td>
                    {b.expires_on ?? <span className={styles.muted}>not recorded</span>}
                    {b.expires_on && b.expires_on < today && b.status === 'available' && (
                      <span className={styles.badge} data-tone="bad"> past date</span>
                    )}
                  </td>
                  <td className={styles.num}>
                    <strong>{b.quantity}</strong>
                  </td>
                  <td>
                    <span className={styles.badge} data-tone={statusTone[b.status]}>{b.status}</span>
                  </td>
                  <td>
                    {(editStock || recall) && b.quantity > 0 && (
                      <details>
                        <summary>Change</summary>
                        <div className={styles.form}>
                          {editStock && b.status === 'available' && (
                            <ActionForm action={adjustBatch.bind(null, b.id, productId)}>
                              <div className={styles.row}>
                                <label className={styles.field}>
                                  <span>Units (+/−)</span>
                                  <input name="change" type="number" required />
                                </label>
                                <label className={styles.field}>
                                  <span>Why</span>
                                  <select name="reason">
                                    <option value="damaged">Damaged</option>
                                    <option value="lost">Lost</option>
                                    <option value="found">Found</option>
                                    <option value="adjusted">Count correction</option>
                                  </select>
                                </label>
                              </div>
                              <label className={styles.field}>
                                <span>Note</span>
                                <input name="note" required />
                              </label>
                              <button type="submit" className={styles.secondary}>Update count</button>
                            </ActionForm>
                          )}
                          {editStock && (b.status === 'available' || b.status === 'quarantined') && (
                            <ActionForm action={setBatchStatus.bind(null, b.id, productId, b.status === 'available' ? 'quarantined' : 'available')}>
                              <label className={styles.field}>
                                <span>Note</span>
                                <input name="note" required={b.status === 'available'} />
                              </label>
                              <button type="submit" className={styles.secondary}>
                                {b.status === 'available' ? 'Quarantine (take off sale)' : 'Release back to sale'}
                              </button>
                            </ActionForm>
                          )}
                          {recall && (b.status === 'available' || b.status === 'quarantined') && (
                            <ActionForm action={setBatchStatus.bind(null, b.id, productId, 'recalled')} confirm={`Recall batch ${b.batch_code}? This can’t be undone.`}>
                              <label className={styles.field}>
                                <span>Recall reason</span>
                                <input name="note" required />
                              </label>
                              <button type="submit" className={styles.danger}>Recall batch</button>
                            </ActionForm>
                          )}
                          {editStock && b.status !== 'available' && (
                            <ActionForm action={writeOffBatch.bind(null, b.id, productId)} confirm={`Write off all ${b.quantity} units of batch ${b.batch_code}?`}>
                              <label className={styles.field}>
                                <span>Note (e.g. how it was disposed of)</span>
                                <input name="note" required />
                              </label>
                              <button type="submit" className={styles.danger}>Write off</button>
                            </ActionForm>
                          )}
                        </div>
                      </details>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(batches ?? []).length === 0 && <p className={styles.empty}>No batches yet. Receive stock to add one.</p>}
        </div>
      </section>

      <section className={styles.panel} aria-labelledby="moves-title">
        <div className={styles.panelHead}>
          <h2 id="moves-title">Stock movements</h2>
          <a href={`/admin/inventory/export?type=movements&product=${productId}`} className={styles.secondary} download>
            Export (CSV)
          </a>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col" className={styles.num}>Units</th>
                <th scope="col">Who</th>
              </tr>
            </thead>
            <tbody>
              {(movements ?? []).map((m) => (
                <tr key={m.id}>
                  <td>
                    <strong>{movementLabels[m.reason]}</strong>
                    <div className={styles.muted}>
                      {[
                        formatDateTime(m.at),
                        sizeLabel(m.size_code),
                        m.batch_id ? `batch ${batchCode.get(m.batch_id)}` : null,
                        m.orders ? `order ${m.orders.order_number}` : null,
                        m.note,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </td>
                  <td className={styles.num}>
                    <strong>{m.quantity ? (m.quantity > 0 ? `+${m.quantity}` : m.quantity) : '–'}</strong>
                    {m.sellable_change !== m.quantity && (
                      <div className={styles.muted}>
                        {m.sellable_change ? `${m.sellable_change > 0 ? '+' : ''}${m.sellable_change} for sale` : 'not for sale'}
                      </div>
                    )}
                  </td>
                  <td className={styles.muted}>{m.actor_email ?? 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
