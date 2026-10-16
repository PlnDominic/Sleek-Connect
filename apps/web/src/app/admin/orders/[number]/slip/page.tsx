import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { requireStaffPage } from '@/lib/admin/session';
import { formatDateTime } from '@/lib/orders';
import { PrintButton } from '@/app/orders/[token]/receipt/PrintButton';
import styles from './slip.module.css';

export const metadata: Metadata = { title: 'Pick list and packing slip' };

export default async function SlipPage({ params }: PageProps<'/admin/orders/[number]/slip'>) {
  const staff = await requireStaffPage();
  if (!staff) return null;
  const { number } = await params;
  const db = staff.supabase;
  const { data: order } = await db
    .from('orders')
    .select('id, order_number, created_at, customer_name, phone, area, ghanapost_gps, rider_directions, is_gift, delivery_options(label)')
    .eq('order_number', number)
    .maybeSingle();
  if (!order) notFound();
  const [{ data: items }, { data: pick }] = await Promise.all([
    db.from('order_items').select('id, product_name, size_label, quantity, unit_price_ghs, line_total_ghs').eq('order_id', order.id).order('product_name'),
    db.rpc('admin_pick_list', { p_order_id: order.id }),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.toolbar}>
        <Link href={`/admin/orders/${order.order_number}`}>← Back to order</Link>
        <PrintButton />
      </div>

      <section className={styles.sheet} aria-labelledby="pick-title">
        <h1 id="pick-title">Pick list · {order.order_number}</h1>
        <p>Take each line from the batch shown (earliest expiry first) and check the batch number on the pack.</p>
        <table>
          <thead>
            <tr>
              <th scope="col">✓</th>
              <th scope="col">Item</th>
              <th scope="col">Batch</th>
              <th scope="col">Expiry</th>
              <th scope="col">Qty</th>
            </tr>
          </thead>
          <tbody>
            {(pick ?? []).map((p, i) => (
              <tr key={`${p.order_item_id}-${p.batch_id ?? i}`}>
                <td className={styles.box} aria-hidden="true" />
                <td>
                  {p.product_name}
                  {p.size_label ? `, ${p.size_label}` : ''}
                </td>
                <td>{p.batch_code ?? <strong>NOT ENOUGH STOCK</strong>}</td>
                <td>{p.expires_on ?? '–'}</td>
                <td>{p.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className={styles.sheet} aria-labelledby="slip-title">
        <div className={styles.slipHead}>
          <h1 id="slip-title">Sleek Connect</h1>
          <span>
            Order {order.order_number}
            <br />
            {formatDateTime(order.created_at)}
          </span>
        </div>
        <dl>
          <dt>Deliver to</dt>
          <dd>
            {order.customer_name}, {order.phone}
            <br />
            {[order.area, order.ghanapost_gps].filter(Boolean).join(' · ')}
            {order.rider_directions && (
              <>
                <br />
                {order.rider_directions}
              </>
            )}
          </dd>
          <dt>Delivery</dt>
          <dd>{order.delivery_options?.label}</dd>
        </dl>
        <table>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Qty</th>
              {!order.is_gift && <th scope="col">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {(items ?? []).map((i) => (
              <tr key={i.id}>
                <td>
                  {i.product_name}
                  {i.size_label ? `, ${i.size_label}` : ''}
                </td>
                <td>{i.quantity}</td>
                {!order.is_gift && <td>{formatPrice(i.line_total_ghs)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        {order.is_gift && (
          <div className={styles.gift}>
            <strong>A gift for you</strong>
            <span>Prices are left out because this order is a gift. With love, from Sleek Connect.</span>
          </div>
        )}
        <p className={styles.small}>Authentic, batch-checked products. Questions? Reply to your order SMS.</p>
      </section>
    </div>
  );
}
