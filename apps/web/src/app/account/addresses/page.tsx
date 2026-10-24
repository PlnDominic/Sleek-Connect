import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getDeliveryConfig } from '@/lib/catalog';
import { createUserSupabase } from '@/lib/supabase/server';
import { AddressCard } from './AddressCard';
import { AddressForm } from './AddressForm';
import styles from './addresses.module.css';

export const metadata: Metadata = { title: 'Your addresses', robots: { index: false, follow: false } };

export default function AddressesPage() {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <p className={styles.muted}>
          <Link href="/account">Account</Link>
        </p>
        <h1>Your addresses</h1>
        <Suspense fallback={<p className={styles.muted}>Loading your addresses…</p>}>
          <Addresses />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Addresses() {
  await connection();
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <p className={styles.muted}>
        <Link href="/account?next=/account/addresses">Sign in with Google</Link> to save delivery addresses for faster
        checkout.
      </p>
    );
  }
  const [{ data: addresses, error }, delivery] = await Promise.all([
    supabase
      .from('customer_addresses')
      .select('id, label, recipient_name, phone, area, ghanapost_gps, directions, is_default')
      .order('is_default', { ascending: false })
      .order('created_at'),
    getDeliveryConfig(),
  ]);
  if (error) throw error;
  const areas = delivery.areas.map((a) => a.name);

  return (
    <>
      <p className={styles.muted}>Pick one of these at checkout instead of typing it again. You can save up to 10.</p>
      {addresses.length > 0 && (
        <ul className={styles.list} aria-label="Saved addresses">
          {addresses.map((a) => (
            <AddressCard key={a.id} address={a} areas={areas} />
          ))}
        </ul>
      )}
      {addresses.length < 10 && (
        <section className={styles.panel} aria-labelledby="add-title">
          <h2 id="add-title">Add an address</h2>
          <AddressForm areas={areas} />
        </section>
      )}
    </>
  );
}
