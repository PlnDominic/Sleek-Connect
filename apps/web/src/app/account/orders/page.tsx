import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { formatPriceOr } from '@sleek/shared';
import { formatDate, statusShort } from '@/lib/orders';
import { createUserSupabase } from '@/lib/supabase/server';
import { TrackingBar } from '@/components/TrackingBar';
import styles from '../account.module.css';

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false },
};

export default function OrdersPage({ searchParams }: PageProps<'/account/orders'>) {
  return (
    <>
      <div className={styles.page}>
        <h1>Your orders</h1>
        <Suspense fallback={<p className={styles.muted}>Loading your orders…</p>}>
          <OrderList searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

const tabs = [
  { id: 'all', label: 'All orders' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled or returned' },
] as const;
const closed = ['cancelled', 'returned', 'delivery_failed'];

async function OrderList({ searchParams }: { searchParams: PageProps<'/account/orders'>['searchParams'] }) {
  await connection();
  const query = await searchParams;
  const tab = tabs.find((t) => t.id === query.show)?.id ?? 'all';
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <p className={styles.muted}>
        <Link href="/account?next=/account/orders">Sign in with Google</Link> to see orders placed with your account.
        Orders placed without signing in are in the link we texted you.
      </p>
    );
  }

  const { data: all, error } = await supabase.rpc('my_orders');
  if (error) throw error;
  const orders = all.filter((o) =>
    tab === 'delivered' ? o.status === 'delivered' : tab === 'cancelled' ? closed.includes(o.status) : tab === 'ongoing' ? o.status !== 'delivered' && !closed.includes(o.status) : true,
  );

  const tabBar = (
    <nav className={styles.tabs} aria-label="Filter orders">
      {tabs.map((t) => (
        <Link key={t.id} href={t.id === 'all' ? '/account/orders' : `/account/orders?show=${t.id}`} aria-current={t.id === tab ? 'page' : undefined}>
          {t.label}
        </Link>
      ))}
    </nav>
  );

  if (all.length === 0) {
    return (
      <p className={styles.muted}>
        You haven’t placed any orders with this account yet. <Link href="/">Start shopping</Link>
      </p>
    );
  }

  if (orders.length === 0) {
    return (
      <>
        {tabBar}
        <p className={styles.muted}>No orders in this list.</p>
      </>
    );
  }

  return (
    <>
    {tabBar}
    <ul className={styles.orders} aria-label="Orders, newest first">
      {orders.map((order) => {
        const count = order.item_count;
        return (
          <li key={order.order_number}>
            <Link href={`/orders/${order.order_token}`} className={styles.orderRow}>
              <span>
                <strong>Order {order.order_number}</strong>
                <span className={styles.muted}>
                  {formatDate(order.created_at)} · {count} {count === 1 ? 'item' : 'items'}
                </span>
              </span>
              <span className={styles.orderMeta}>
                <span className={styles.status} data-status={order.status}>
                  {statusShort[order.status]}
                </span>
                <strong>{formatPriceOr(order.total_ghs as number | null, 'To be confirmed')}</strong>
              </span>
              <span className={styles.orderTrack}>
                <TrackingBar status={order.status} compact />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
    </>
  );
}
