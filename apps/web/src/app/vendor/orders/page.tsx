import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { formatPrice } from '@sleek/shared';
import { getVendorSession } from '@/lib/vendor';
import { markPacked } from '../actions';
import { VendorForm } from '../VendorForm';
import styles from '../vendor.module.css';

export const metadata: Metadata = { title: 'Orders' };

interface VendorOrder {
  order_id: string;
  order_number: string;
  paid_at: string;
  order_status: string;
  shipment_status: 'pending' | 'packed' | 'collected';
  packed_at: string | null;
  collected_at: string | null;
  amount_ghs: number;
  lines: { product_name: string; size_label: string | null; quantity: number; unit_ghs: number; amount_ghs: number }[];
}

const dateText = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Accra' });

export default async function VendorOrdersPage() {
  const session = await getVendorSession();
  if (session.state !== 'ready' || !session.vendor?.live) redirect('/vendor');
  const { data, error } = await session.supabase.rpc('vendor_orders');
  if (error) throw error;
  const orders = (data as unknown as VendorOrder[]) ?? [];
  const cancelled = (o: VendorOrder) => o.order_status === 'cancelled';
  const toPack = orders.filter((o) => o.shipment_status === 'pending' && !cancelled(o));
  const rest = orders.filter((o) => !toPack.includes(o));

  const card = (o: VendorOrder) => (
    <li key={o.order_id} className={styles.orderCard}>
      <div className={styles.orderHead}>
        <strong>{o.order_number}</strong>
        <span className={styles.badge} data-tone={cancelled(o) ? 'bad' : o.shipment_status === 'pending' ? 'warn' : 'good'}>
          {cancelled(o) ? 'Cancelled' : o.shipment_status === 'pending' ? 'Pack it' : o.shipment_status === 'packed' ? 'Packed' : 'Collected by us'}
        </span>
      </div>
      <ul className={styles.list}>
        {o.lines.map((l, i) => (
          <li key={i} className={styles.listRow}>
            <span className={styles.listMain}>
              {l.quantity} × {l.product_name}
              {l.size_label && <small>{l.size_label}</small>}
            </span>
            <span className={styles.amount}>{formatPrice(l.amount_ghs)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.muted}>
        Paid {dateText(o.paid_at)} · your share {formatPrice(o.amount_ghs)}
        {o.packed_at && ` · packed ${dateText(o.packed_at)}`}
      </p>
      {o.shipment_status === 'pending' && !cancelled(o) && (
        <VendorForm action={markPacked.bind(null, o.order_id)} confirm="Is everything for this order in the bag?">
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              Mark as packed
            </button>
          </div>
        </VendorForm>
      )}
    </li>
  );

  return (
    <>
      <p className={styles.lead}>Pack the items, mark the order packed, and we will collect it and deliver it. You never see the shopper’s details.</p>
      <section className={styles.panel}>
        <h2>To pack ({toPack.length})</h2>
        {toPack.length === 0 ? <p className={styles.muted}>Nothing to pack right now.</p> : <ul className={styles.list}>{toPack.map(card)}</ul>}
      </section>
      {rest.length > 0 && (
        <section className={styles.panel}>
          <h2>Earlier orders</h2>
          <ul className={styles.list}>{rest.map(card)}</ul>
        </section>
      )}
    </>
  );
}
