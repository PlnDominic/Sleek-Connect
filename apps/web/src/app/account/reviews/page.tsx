import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { createUserSupabase } from '@/lib/supabase/server';
import styles from '../account.module.css';

export const metadata: Metadata = { title: 'Pending reviews', robots: { index: false, follow: false } };

interface Pending {
  product_name: string;
  slug: string;
  order_number: string;
  delivered_at: string | null;
}

const date = new Intl.DateTimeFormat('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });

export default function PendingReviewsPage() {
  return (
    <>
      <h1>Pending reviews</h1>
      <p className={styles.muted}>Products you have received and haven’t reviewed yet. Your review helps other shoppers, and helps us improve.</p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <PendingList />
      </Suspense>
    </>
  );
}

async function PendingList() {
  await connection();
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <p className={styles.muted}>
        <Link href="/account?next=/account/reviews">Sign in</Link> to see the products waiting for your review.
      </p>
    );
  }
  const { data, error } = await supabase.rpc('my_pending_reviews');
  if (error) {
    // The database may not have this page's function yet: say so plainly rather than failing the page.
    return <p className={styles.muted}>This list isn’t available right now. Please try again later.</p>;
  }
  const items = (data as unknown as Pending[]) ?? [];
  if (items.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <strong>Nothing to review</strong>
        <span className={styles.muted}>When an order is delivered, the products show up here so you can rate them.</span>
        <Link href="/account/orders">See your orders</Link>
      </div>
    );
  }
  return (
    <ul className={styles.pendingList}>
      {items.map((item) => (
        <li key={item.slug}>
          <div>
            <strong>{item.product_name}</strong>
            <small>
              Order {item.order_number}
              {item.delivered_at ? ` · delivered ${date.format(new Date(item.delivered_at))}` : ''}
            </small>
          </div>
          <Link href={`/products/${item.slug}#reviews`} className={styles.rate}>
            Write a review
          </Link>
        </li>
      ))}
    </ul>
  );
}
