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

  // What is in each order is read alongside the list (apart, so the list still works before that function exists).
  const [{ data: all, error }, { data: itemData }] = await Promise.all([supabase.rpc('my_orders'), supabase.rpc('my_order_items')]);
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

  const itemsByOrder = (itemData ?? {}) as unknown as Record<string, { name: string; size: string | null; quantity: number; slug: string | null }[]>;

  return (
    <>
      {tabBar}
      <ul className={styles.orderCards} aria-label="Orders, newest first">
        {orders.map((order) => {
          const items = itemsByOrder[order.order_number] ?? [];
          const shown = items.slice(0, 3);
          return (
            <li key={order.order_number} className={styles.orderCard}>
              <div className={styles.orderTop}>
                <div>
                  <strong>Order {order.order_number}</strong>
                  <span className={styles.muted}>Placed on {formatDate(order.created_at)}</span>
                </div>
                <span className={styles.status} data-status={order.status}>
                  {statusShort[order.status]}
                </span>
              </div>
              {shown.length > 0 && (
                <ul className={styles.orderLines}>
                  {shown.map((item, i) => (
                    <li key={`${item.name}-${i}`}>
                      <span>
                        {item.slug ? <Link href={`/products/${item.slug}`}>{item.name}</Link> : item.name}
                        {item.size ? <small>{item.size}</small> : null}
                      </span>
                      <span className={styles.muted}>Qty: {item.quantity}</span>
                    </li>
                  ))}
                  {items.length > shown.length && <li className={styles.muted}>+ {items.length - shown.length} more {items.length - shown.length === 1 ? 'item' : 'items'}</li>}
                </ul>
              )}
              <div className={styles.orderTrack}>
                <TrackingBar status={order.status} compact />
              </div>
              <div className={styles.orderBottom}>
                <span>
                  <span className={styles.muted}>{order.item_count} {order.item_count === 1 ? 'item' : 'items'} · Total</span>{' '}
                  <strong>{formatPriceOr(order.total_ghs as number | null, 'To be confirmed')}</strong>
                </span>
                <Link href={`/orders/${order.order_token}`} className={styles.seeDetails}>
                  See details
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
