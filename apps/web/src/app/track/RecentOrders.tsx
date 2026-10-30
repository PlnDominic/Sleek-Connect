'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { TrackingBar } from '@/components/TrackingBar';
import { statusShort, type OrderStatus } from '@/lib/orders';
import { forgetRecentOrders, readRecentOrders, type RecentOrder } from '@/lib/recent-orders';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import styles from './track.module.css';

type Row = RecentOrder & { status: OrderStatus | null };

/** Orders opened on this device, with their live status, so returning shoppers can track in one tap. */
export function RecentOrders() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    const saved = readRecentOrders();
    if (saved.length === 0) {
      setTimeout(() => setRows([]), 0);
      return;
    }
    const supabase = createBrowserSupabase();
    let cancelled = false;
    Promise.all(
      saved.map(async (o) => {
        const { data } = await supabase.rpc('get_order_status', { p_order_token: o.token });
        return { ...o, status: (data?.[0]?.status as OrderStatus | undefined) ?? null };
      }),
    ).then((all) => {
      if (!cancelled) setRows(all.filter((r) => r.status !== null));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rows || rows.length === 0) return null;
  return (
    <section className={styles.recent} aria-labelledby="recent-orders">
      <div className={styles.recentHead}>
        <h2 id="recent-orders">Your recent orders</h2>
        <button
          type="button"
          className={styles.forget}
          onClick={() => {
            forgetRecentOrders();
            setRows([]);
          }}
        >
          Forget on this device
        </button>
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.token}>
            <Link href={`/orders/${r.token}`} className={styles.recentRow}>
              <span className={styles.recentTop}>
                <strong>Order {r.orderNumber}</strong>
                <span className={styles.status}>{statusShort[r.status!]}</span>
              </span>
              <TrackingBar status={r.status!} compact />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
