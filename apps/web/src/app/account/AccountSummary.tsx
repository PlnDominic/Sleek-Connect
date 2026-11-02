'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatPriceOr } from '@sleek/shared';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { formatDate, statusShort } from '@/lib/orders';
import styles from './account.module.css';

interface Summary {
  address: { label: string | null; recipient_name: string; phone: string; area: string | null } | null;
  addressCount: number;
  momo: { network: string; wallet_number: string; label: string | null } | null;
  orders: { order_number: string; order_token: string; created_at: string; status: keyof typeof statusShort; total_ghs: number; item_count: number }[];
}

const networks: Record<string, string> = { mtn: 'MTN MoMo', telecel: 'Telecel Cash', at: 'AT Money' };

/** The overview cards (account details, address book, Mobile Money, notifications) and the latest orders, read in the browser as the shopper. */
export function AccountSummary({ name, email, userId, marketingSms, marketingEmail, bagCount }: { name?: string; email: string; userId: string; marketingSms: boolean; marketingEmail: boolean; bagCount: number }) {
  const [data, setData] = useState<{ userId: string; summary: Summary } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabase();
    Promise.all([
      supabase.from('customer_addresses').select('label, recipient_name, phone, area').order('is_default', { ascending: false }).order('created_at'),
      supabase.from('saved_payment_methods').select('network, wallet_number, label').order('is_default', { ascending: false }).order('created_at').limit(1),
      supabase.rpc('my_orders').limit(3),
    ]).then(([addresses, methods, orders]) => {
      if (cancelled) return;
      setData({
        userId,
        summary: {
          address: addresses.data?.[0] ?? null,
          addressCount: addresses.data?.length ?? 0,
          momo: methods.data?.[0] ?? null,
          orders: (orders.data ?? []) as unknown as Summary['orders'],
        },
      });
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const summary = data?.userId === userId ? data.summary : null;
  const prefs = [marketingSms && 'SMS', marketingEmail && 'email'].filter(Boolean).join(' and ');

  return (
    <>
      <div className={styles.overviewGrid}>
        <section className={styles.infoCard} aria-labelledby="ov-details">
          <div className={styles.infoHead}>
            <h2 id="ov-details">Account details</h2>
            <Link href="/account/details">Edit</Link>
          </div>
          <div className={styles.infoBody}>
            <strong>{name || 'Add your name'}</strong>
            <span>{email}</span>
          </div>
        </section>

        <section className={styles.infoCard} aria-labelledby="ov-address">
          <div className={styles.infoHead}>
            <h2 id="ov-address">Address book</h2>
            <Link href="/account/addresses">{summary?.address ? 'Edit' : 'Add'}</Link>
          </div>
          <div className={styles.infoBody}>
            {summary === null ? (
              <span>Loading…</span>
            ) : summary.address ? (
              <>
                <strong>{summary.address.recipient_name}</strong>
                <span>
                  {[summary.address.area, summary.address.phone].filter(Boolean).join(' · ')}
                </span>
                {summary.addressCount > 1 && <span>+ {summary.addressCount - 1} more saved</span>}
              </>
            ) : (
              <span>No delivery address saved yet.</span>
            )}
          </div>
        </section>

        <section className={styles.infoCard} aria-labelledby="ov-momo">
          <div className={styles.infoHead}>
            <h2 id="ov-momo">Mobile Money</h2>
            <Link href="/account/payment-methods">{summary?.momo ? 'Edit' : 'Add'}</Link>
          </div>
          <div className={styles.infoBody}>
            {summary === null ? (
              <span>Loading…</span>
            ) : summary.momo ? (
              <>
                <strong>{networks[summary.momo.network] ?? summary.momo.network}</strong>
                <span>{summary.momo.wallet_number}</span>
              </>
            ) : (
              <span>No number saved yet. Save one to pay faster.</span>
            )}
          </div>
        </section>

        <section className={styles.infoCard} aria-labelledby="ov-notify">
          <div className={styles.infoHead}>
            <h2 id="ov-notify">Notifications</h2>
            <Link href="/account/details">Change</Link>
          </div>
          <div className={styles.infoBody}>
            <strong>{prefs ? `Offers by ${prefs}` : 'No marketing messages'}</strong>
            <span>Order and delivery updates are always sent.</span>
          </div>
        </section>

        <section className={`${styles.infoCard} ${styles.recent}`} aria-labelledby="ov-orders">
          <div className={styles.infoHead}>
            <h2 id="ov-orders">Recent orders</h2>
            <Link href="/account/orders">See all</Link>
          </div>
          {summary === null ? (
            <span className={styles.muted}>Loading…</span>
          ) : summary.orders.length === 0 ? (
            <p className={styles.muted}>
              You haven’t placed an order with this account yet. <Link href="/shop">Start shopping</Link>
              {bagCount > 0 ? ` · ${bagCount} ${bagCount === 1 ? 'item is' : 'items are'} in your bag` : ''}
            </p>
          ) : (
            <ul className={styles.recentOrders}>
              {summary.orders.map((o) => (
                <li key={o.order_number}>
                  <Link href={`/orders/${o.order_token}`}>
                    <span>
                      <strong>Order {o.order_number}</strong>
                      <span className={styles.muted}>
                        {formatDate(o.created_at)} · {o.item_count} {o.item_count === 1 ? 'item' : 'items'}
                      </span>
                    </span>
                    <span className={styles.orderMeta}>
                      <span className={styles.status} data-status={o.status}>
                        {statusShort[o.status]}
                      </span>
                      <strong>{formatPriceOr(o.total_ghs, 'To be confirmed')}</strong>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
