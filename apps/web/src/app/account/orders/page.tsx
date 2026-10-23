import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { formatPriceOr } from '@sleek/shared';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { formatDate, statusShort } from '@/lib/orders';
import { createUserSupabase } from '@/lib/supabase/server';
import styles from '../account.module.css';

export const metadata: Metadata = {
  title: 'Your orders',
  robots: { index: false, follow: false },
};

export default function OrdersPage() {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <h1>Your orders</h1>
        <Suspense fallback={<p className={styles.muted}>Loading your orders…</p>}>
          <OrderList />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function OrderList() {
  await connection();
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

  const { data: orders, error } = await supabase.rpc('my_orders');
  if (error) throw error;

  if (orders.length === 0) {
    return (
      <p className={styles.muted}>
        You haven’t placed any orders with this account yet. <Link href="/">Start shopping</Link>
      </p>
    );
  }

  return (
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
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
