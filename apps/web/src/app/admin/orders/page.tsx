import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPriceOr } from '@sleek/shared';
import { can, requireStaffPage } from '@/lib/admin/session';
import { formatDateTime, type OrderStatus } from '@/lib/orders';
import { ActionForm } from '../ActionForm';
import { StatusBadge } from '../StatusBadge';
import { bulkOrders } from './actions';
import { orderViews, type OrderView } from './queries';
import styles from '../admin.module.css';

export const metadata: Metadata = { title: 'Orders' };

export default async function OrdersPage({ searchParams }: PageProps<'/admin/orders'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const params = await searchParams;
  const view: OrderView = typeof params.view === 'string' && params.view in orderViews ? (params.view as OrderView) : 'to_pack';
  const q = typeof params.q === 'string' ? params.q.trim() : '';
  const config = orderViews[view];

  let query = staff.supabase
    .from('orders')
    .select('id, order_number, status, customer_name, phone, area, delivery_option_id, total_ghs, created_at, needs_review, refund_due, is_gift, payment_method, order_items(quantity)')
    .limit(200);
  if ('statuses' in config) query = query.in('status', [...config.statuses]);
  if ('flag' in config) query = query.eq(config.flag, true);
  if ('method' in config) query = query.eq('payment_method', config.method);
  if ('notMethod' in config) query = query.neq('payment_method', config.notMethod);
  if (q) {
    const term = q.replace(/[^\p{L}\p{N} +-]/gu, '');
    query = query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,phone.ilike.%${term}%`);
  }
  query = query.order('created_at', { ascending: 'oldestFirst' in config });
  const { data: orders, error } = await query;
  if (error) throw error;

  // The bulk form stays mounted even when the queue empties, so its result message isn't lost.
  const bulk = view === 'to_pack' && can(staff.role, 'orders.fulfil');
  const table = (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {bulk && <th scope="col"><span className="visually-hidden">Select</span></th>}
            <th scope="col">Order</th>
            <th scope="col">Customer</th>
            <th scope="col">Delivery</th>
            <th scope="col" className={styles.num}>Total</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id} data-alert={o.needs_review || undefined}>
              {bulk && (
                <td>
                  <input type="checkbox" name="ids" value={o.id} aria-label={`Select order ${o.order_number}`} />
                </td>
              )}
              <td>
                <Link href={`/admin/orders/${o.order_number}`}>{o.order_number}</Link>
                <div className={styles.muted}>
                  {formatDateTime(o.created_at)}
                  {o.is_gift && ' · gift'}
                  {o.payment_method === 'cod' && ' · pay on delivery'}
                </div>
              </td>
              <td>
                <strong>{o.customer_name}</strong>
                <div className={styles.muted}>{o.phone}</div>
              </td>
              <td>
                {o.area}
                <div className={styles.muted}>
                  {o.delivery_option_id === 'same_day' ? 'Same day' : 'Standard'} · {o.order_items.reduce((n, i) => n + i.quantity, 0)} item
                  {o.order_items.reduce((n, i) => n + i.quantity, 0) === 1 ? '' : 's'}
                </div>
              </td>
              <td className={styles.num}>
                <strong>{formatPriceOr(o.total_ghs as number | null, '–')}</strong>
              </td>
              <td>
                <StatusBadge status={o.status as OrderStatus} />
                {o.needs_review && <span className={styles.badge} data-tone="bad"> Review</span>}
                {o.refund_due && <span className={styles.badge} data-tone="warn"> Refund due</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orders.length === 0 && <p className={styles.empty}>No orders here.</p>}
    </div>
  );

  return (
    <>
      <div className={styles.pageHead}>
        <div>
          <h1>Orders</h1>
          <p className={styles.muted}>Oldest first in each queue.</p>
        </div>
        <div className={styles.buttons}>
          <form className={styles.search} role="search">
            <input type="hidden" name="view" value={view} />
            <input name="q" type="search" defaultValue={q} placeholder="Order number, name or phone" aria-label="Search orders" />
            <button type="submit" className={styles.secondary}>Search</button>
          </form>
          <a className={styles.secondary} href={`/admin/orders/export?view=${view}${q ? `&q=${encodeURIComponent(q)}` : ''}`} download>
            Export CSV
          </a>
        </div>
      </div>
      <nav className={styles.tabs} aria-label="Order queues">
        {(Object.keys(orderViews) as OrderView[]).map((key) => (
          <Link key={key} href={`/admin/orders?view=${key}`} aria-current={key === view ? 'page' : undefined}>
            {orderViews[key].label}
          </Link>
        ))}
      </nav>
      <section className={styles.panel} aria-label={`${config.label} orders`}>
        {bulk ? (
          <ActionForm action={bulkOrders}>
            <div className={styles.buttons}>
              <button type="submit" name="op" value="start" className={styles.secondary} disabled={orders.length === 0}>
                Start packing selected
              </button>
              <button type="submit" name="op" value="pack" className={styles.primary} disabled={orders.length === 0}>
                Mark selected as packed
              </button>
            </div>
            {table}
          </ActionForm>
        ) : (
          table
        )}
      </section>
    </>
  );
}
