import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { createUserSupabase } from '@/lib/supabase/server';
import styles from '../addresses/addresses.module.css';
import { MethodCard } from './MethodCard';
import { MethodForm } from './MethodForm';

export const metadata: Metadata = { title: 'Your Mobile Money numbers', robots: { index: false, follow: false } };

export default function PaymentMethodsPage() {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <p className={styles.muted}>
          <Link href="/account">Account</Link>
        </p>
        <h1>Your Mobile Money numbers</h1>
        <Suspense fallback={<p className={styles.muted}>Loading your numbers…</p>}>
          <Methods />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function Methods() {
  await connection();
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <p className={styles.muted}>
        <Link href="/account?next=/account/payment-methods">Sign in with Google</Link> to save a Mobile Money number for faster
        checkout.
      </p>
    );
  }
  const { data: methods, error } = await supabase
    .from('saved_payment_methods')
    .select('id, network, wallet_number, label, is_default')
    .order('is_default', { ascending: false })
    .order('created_at');
  if (error) throw error;

  return (
    <>
      <p className={styles.muted}>
        Pick one of these at checkout instead of typing it again. We keep only the network and the number: you still approve every
        payment on your phone, and we never see your PIN. You can save up to 5.
      </p>
      {methods.length > 0 && (
        <ul className={styles.list} aria-label="Saved Mobile Money numbers">
          {methods.map((m) => (
            <MethodCard key={m.id} method={m} />
          ))}
        </ul>
      )}
      {methods.length < 5 && (
        <section className={styles.panel} aria-labelledby="add-title">
          <h2 id="add-title">Add a number</h2>
          <MethodForm />
        </section>
      )}
    </>
  );
}
