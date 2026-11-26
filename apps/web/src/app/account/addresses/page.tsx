import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { createUserSupabase } from '@/lib/supabase/server';
import { AddressCard } from './AddressCard';
import { AddressForm } from './AddressForm';
import styles from './addresses.module.css';

export const metadata: Metadata = { title: 'Your addresses', robots: { index: false, follow: false } };

export default function AddressesPage() {
  return (
    <>
      <div className={styles.page}>
        <h1>Your addresses</h1>
        <Suspense fallback={<p className={styles.muted}>Loading your addresses…</p>}>
          <Addresses />
        </Suspense>
      </div>
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
  const { data: addresses, error } = await supabase
    .from('customer_addresses')
    .select('id, label, recipient_name, phone, area, ghanapost_gps, directions, is_default')
    .order('is_default', { ascending: false })
    .order('created_at');
  if (error) throw error;

  return (
    <>
      <p className={styles.muted}>Pick one of these at checkout instead of typing it again. You can save up to 10.</p>
      {addresses.length > 0 && (
        <ul className={styles.list} aria-label="Saved addresses">
          {addresses.map((a) => (
            <AddressCard key={a.id} address={a} />
          ))}
        </ul>
      )}
      {addresses.length < 10 && (
        <section className={styles.panel} aria-labelledby="add-title">
          <h2 id="add-title">Add an address</h2>
          <AddressForm />
        </section>
      )}
    </>
  );
}
