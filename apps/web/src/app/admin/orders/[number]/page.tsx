import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice, formatPriceOr } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { failureReasons, formatDateTime, networkNames, statusLabels, type DeliveryFailureReason, type OrderStatus } from '@/lib/orders';
import { ActionForm } from '../../ActionForm';
import { Flash } from '../../Flash';
import { StatusBadge } from '../../StatusBadge';
import {
  cancelOrder,
  dispatchOrder,
  markDelivered,
  markFailed,
  packOrder,
  resolveFlag,
  returnToStock,
  startPacking,
} from '../actions';
import { orderColumns } from '../queries';
import styles from '../../admin.module.css';

export async function generateMetadata({ params }: PageProps<'/admin/orders/[number]'>): Promise<Metadata> {
  return { title: `Order ${(await params).number}` };
}

const reasons = Object.entries(failureReasons) as [DeliveryFailureReason, string][];

export default async function AdminOrderPage({ params, searchParams }: PageProps<'/admin/orders/[number]'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { number } = await params;
  const { done } = await searchParams;
  const db = staff.supabase;

  const { data: order, error } = await db
    .from('orders')
    .select(`${orderColumns}, delivery_options(label), riders(name, phone)`)
    .eq('order_number', number)
    .maybeSingle();
  if (error) throw error;
  if (!order) notFound();

  const [items, events, payments, notes, pick, riders, settings] = await Promise.all([
    db.from('order_items').select('id, product_name, size_label, quantity, unit_price_ghs, line_total_ghs').eq('order_id', order.id).order('product_name'),
    db.from('order_events').select('id, status, at, actor_email, note, details').eq('order_id', order.id).order('at'),
    db.from('payments').select('id, provider, provider_reference, amount_ghs, status, created_at').eq('order_id', order.id).order('created_at'),
    db.from('notifications').select('id, template, channel, recipient, status, last_error, created_at, sent_at').eq('order_id', order.id).order('created_at'),
    db.rpc('admin_pick_list', { p_order_id: order.id }),
    db.from('riders').select('id, name, vehicle').eq('is_active', true).order('name'),
    db.from('store_settings').select('max_delivery_attempts, require_delivery_code').single(),
  ]);

  const status = order.status as OrderStatus;
  const fulfil = can(staff.role, 'orders.fulfil');
  const id = order.id;
  const shortfall = (pick.data ?? []).some((r) => r.batch_id === null);
  const attemptsLeft = (settings.data?.max_delivery_attempts ?? 2) - order.delivery_attempts;

  const dispatchForm = (
    <ActionForm action={dispatchOrder.bind(null, id, order.order_number)}>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Rider</span>
          <select name="rider" defaultValue="">
            <option value="">Courier (enter reference)</option>
            {(riders.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.vehicle}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Courier tracking reference</span>
          <input name="courier" placeholder="Only for a courier partner" />
        </label>
      </div>
      <label className={styles.field}>
        <span>Note for the history (optional)</span>
        <input name="note" />
      </label>
      <button type="submit" className={styles.primary}>
        {status === 'delivery_failed' ? 'Send out again' : 'Hand over for delivery'}
      </button>
    </ActionForm>
  );

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.muted}>
            <Link href="/admin/orders">Orders</Link> /
          </p>
          <h1>
            Order {order.order_number} <StatusBadge status={status} />
          </h1>
          <p className={styles.muted}>
            Placed {formatDateTime(order.created_at)}
            {order.paid_at && ` · paid ${formatDateTime(order.paid_at)}`}
          </p>
        </div>
        {['paid', 'packing', 'packed'].includes(status) && (
          <Link href={`/admin/orders/${order.order_number}/slip`} className={styles.secondary}>
            Print pick list and packing slip
          </Link>
        )}
      </div>

      <Flash message={done} />
      {order.needs_review && (
        <div className={styles.notice} role="note">
          <strong>Needs review.</strong> Something about this order needs a decision (a payment that doesn’t match,
          a late payment or a recall). Check the history and payments below.
          {can(staff.role, 'orders.review') && (
            <ActionForm action={resolveFlag.bind(null, id, order.order_number, 'needs_review')} className={styles.row}>
              <label className={styles.field}>
                <span>How was it resolved?</span>
                <input name="note" required />
              </label>
              <button type="submit" className={styles.secondary}>Mark resolved</button>
            </ActionForm>
          )}
        </div>
      )}
      {order.refund_due && (
        <div className={styles.notice} role="note">
          <strong>Refund due.</strong> The customer paid but won’t receive this order. Refund{' '}
          {formatPriceOr(order.total_ghs as number | null, '')} to their {order.momo_network ? networkNames[order.momo_network as 'mtn'] : 'payment'} wallet, then record it here.
          {can(staff.role, 'orders.refund') && (
            <ActionForm action={resolveFlag.bind(null, id, order.order_number, 'refund_due')} className={styles.row}>
              <label className={styles.field}>
                <span>Refund reference</span>
                <input name="note" required />
              </label>
              <button type="submit" className={styles.secondary}>Mark refunded</button>
            </ActionForm>
          )}
        </div>
      )}

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="next-title">
          <h2 id="next-title">Next step</h2>
          {!fulfil && <p className={styles.muted}>Your role can view this order but not move it along.</p>}
          {fulfil && status === 'pending_payment' && <p className={styles.muted}>Waiting for the customer to pay.</p>}
          {fulfil && (status === 'paid' || status === 'packing') && (
            <>
              {shortfall && (
                <p className={styles.error}>Not enough usable stock to pack this order. Receive stock or check the batches.</p>
              )}
              <div className={styles.buttons}>
                {status === 'paid' && (
                  <ActionForm action={startPacking.bind(null, id, order.order_number)}>
                    <button type="submit" className={styles.secondary}>Start packing</button>
                  </ActionForm>
                )}
                <ActionForm action={packOrder.bind(null, id, order.order_number)}>
                  <button type="submit" className={styles.primary}>Mark as packed</button>
                </ActionForm>
              </div>
              <p className={styles.muted}>Packing takes the units from the batches in the pick list.</p>
            </>
          )}
          {fulfil && status === 'packed' && dispatchForm}
          {fulfil && status === 'out_for_delivery' && (
            <>
              <ActionForm action={markDelivered.bind(null, id, order.order_number)}>
                <h3>Delivered</h3>
                <div className={styles.row}>
                  <label className={styles.field}>
                    <span>Received by</span>
                    <input name="recipient" required defaultValue={order.customer_name} />
                  </label>
                  {settings.data?.require_delivery_code && (
                    <label className={styles.field}>
                      <span>Customer’s delivery code</span>
                      <input name="code" required={staff.role !== 'admin'} inputMode="numeric" pattern="[0-9]{4}" maxLength={4} />
                      {staff.role === 'admin' && <small>Admins can leave it empty if the customer lost it (add a note).</small>}
                    </label>
                  )}
                </div>
                {staff.role === 'admin' && (
                  <label className={styles.field}>
                    <span>Note</span>
                    <input name="note" />
                  </label>
                )}
                <button type="submit" className={styles.primary}>Mark as delivered</button>
              </ActionForm>
              <details className={styles.inline}>
                <summary>Delivery failed</summary>
                <ActionForm action={markFailed.bind(null, id, order.order_number)}>
                  <label className={styles.field}>
                    <span>What happened?</span>
                    <select name="reason" required>
                      {reasons.map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className={styles.field}>
                    <span>Note</span>
                    <input name="note" />
                  </label>
                  <button type="submit" className={styles.danger}>Record failed delivery</button>
                </ActionForm>
              </details>
            </>
          )}
          {fulfil && status === 'delivery_failed' && (
            <>
              <p className={styles.muted}>
                Call the customer on {order.phone}, then send it out again ({Math.max(attemptsLeft, 0)} attempt
                {attemptsLeft === 1 ? '' : 's'} left) or bring it back into stock.
              </p>
              {attemptsLeft > 0 && dispatchForm}
              <ActionForm action={returnToStock.bind(null, id, order.order_number)} confirm="Return this order to stock? It will need a refund.">
                <label className={styles.field}>
                  <span>Note</span>
                  <input name="note" placeholder="e.g. Customer unreachable after two attempts" />
                </label>
                <button type="submit" className={styles.danger}>Return to stock</button>
              </ActionForm>
            </>
          )}
          {['delivered', 'cancelled', 'returned'].includes(status) && (
            <p className={styles.muted}>
              {status === 'delivered'
                ? `Delivered to ${order.delivered_to} on ${order.delivered_at ? formatDateTime(order.delivered_at) : ''}.`
                : status === 'cancelled'
                  ? `Cancelled${order.cancel_reason ? `: ${order.cancel_reason}` : ''}.`
                  : 'Returned to stock after a failed delivery.'}
            </p>
          )}
          {can(staff.role, 'orders.cancel') && ['pending_payment', 'paid', 'packing', 'packed'].includes(status) && (
            <details className={styles.inline}>
              <summary>Cancel order</summary>
              <ActionForm action={cancelOrder.bind(null, id, order.order_number)} confirm="Cancel this order? Its stock goes back on sale.">
                <label className={styles.field}>
                  <span>Reason</span>
                  <input name="reason" required />
                </label>
                <button type="submit" className={styles.danger}>Cancel order</button>
              </ActionForm>
            </details>
          )}
        </section>

        <section className={styles.panel} aria-labelledby="customer-title">
          <h2 id="customer-title">Customer and delivery</h2>
          <dl className={styles.facts}>
            <dt>Name</dt>
            <dd>{order.customer_name}</dd>
            <dt>Phone</dt>
            <dd>{order.phone}</dd>
            <dt>Area</dt>
            <dd>{order.area}</dd>
            <dt>GhanaPost GPS</dt>
            <dd>{order.ghanapost_gps ?? '–'}</dd>
            <dt>Directions</dt>
            <dd>{order.rider_directions ?? '–'}</dd>
            <dt>Window</dt>
            <dd>{order.delivery_options?.label}</dd>
            <dt>Gift</dt>
            <dd>{order.is_gift ? 'Yes: no prices in the parcel' : 'No'}</dd>
            <dt>Rider</dt>
            <dd>
              {order.riders ? `${order.riders.name} (${order.riders.phone})` : order.courier_reference ? `Courier ${order.courier_reference}` : '–'}
              {order.delivery_attempts > 0 && ` · attempt ${order.delivery_attempts}`}
            </dd>
            <dt>Account</dt>
            <dd>{order.user_id ? 'Signed-in customer' : 'Guest checkout'}</dd>
          </dl>
        </section>
      </div>

      <div className={styles.columns}>
        <section className={styles.panel} aria-labelledby="items-title">
          <h2 id="items-title">Items and pick list</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col" className={styles.num}>Qty</th>
                  <th scope="col" className={styles.num}>Unit</th>
                  <th scope="col" className={styles.num}>Total</th>
                </tr>
              </thead>
              <tbody>
                {(items.data ?? []).map((i) => (
                  <tr key={i.id}>
                    <td>
                      {i.product_name}
                      {i.size_label && <span className={styles.muted}> · {i.size_label}</span>}
                      <div className={styles.muted}>
                        {(pick.data ?? [])
                          .filter((p) => p.order_item_id === i.id)
                          .map((p) =>
                            p.batch_id
                              ? `${p.packed ? 'Packed from' : 'Take'} ${p.quantity} × batch ${p.batch_code}${p.expires_on ? ` (exp. ${p.expires_on})` : ''}`
                              : `Short by ${p.quantity}`,
                          )
                          .join(' · ')}
                      </div>
                    </td>
                    <td className={styles.num}>{i.quantity}</td>
                    <td className={styles.num}>{formatPrice(i.unit_price_ghs)}</td>
                    <td className={styles.num}>{formatPrice(i.line_total_ghs)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>Subtotal</td>
                  <td className={styles.num}>{formatPrice(order.subtotal_ghs)}</td>
                </tr>
                <tr>
                  <td colSpan={3}>Delivery</td>
                  <td className={styles.num}>{formatPriceOr(order.delivery_fee_ghs as number | null, '–')}</td>
                </tr>
                <tr>
                  <td colSpan={3}>
                    <strong>Total</strong>
                  </td>
                  <td className={styles.num}>
                    <strong>{formatPriceOr(order.total_ghs as number | null, '–')}</strong>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <h2>Payments</h2>
          {(payments.data ?? []).length === 0 ? (
            <p className={styles.muted}>No payment attempts.</p>
          ) : (
            <ul className={styles.muted}>
              {(payments.data ?? []).map((p) => (
                <li key={p.id}>
                  {p.provider} {p.provider_reference}: {formatPrice(p.amount_ghs)}, {p.status}
                </li>
              ))}
            </ul>
          )}
          <p className={styles.muted}>
            {order.payment_method === 'momo'
              ? `${order.momo_network ? networkNames[order.momo_network as 'mtn'] : 'Mobile Money'} · ${order.wallet_number}`
              : 'Card'}
          </p>
        </section>

        <section className={styles.panel} aria-labelledby="history-title">
          <h2 id="history-title">History</h2>
          <ol className={styles.form}>
            {(events.data ?? []).map((e) => {
              const details = (e.details ?? {}) as Record<string, string | number | boolean | null>;
              return (
                <li key={e.id}>
                  <strong>{statusLabels[e.status as OrderStatus]}</strong>{' '}
                  <span className={styles.muted}>
                    {formatDateTime(e.at)} · {e.actor_email ?? 'system'}
                  </span>
                  {(e.note || Object.keys(details).length > 0) && (
                    <div className={styles.muted}>
                      {[
                        e.note,
                        details.reason ? failureReasons[details.reason as DeliveryFailureReason] : null,
                        details.rider ? `Rider ${details.rider}` : null,
                        details.courier_reference ? `Courier ref ${details.courier_reference}` : null,
                        details.recipient ? `Received by ${details.recipient}${details.code_checked ? ' (code checked)' : ''}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
          <h2>Messages to the customer</h2>
          {(notes.data ?? []).length === 0 ? (
            <p className={styles.muted}>None yet.</p>
          ) : (
            <ul className={styles.muted}>
              {(notes.data ?? []).map((n) => (
                <li key={n.id}>
                  {n.template.replaceAll('_', ' ')} by {n.channel} to {n.recipient}: {n.status.replace('_', ' ')}
                  {n.last_error && ` (${n.last_error})`}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
