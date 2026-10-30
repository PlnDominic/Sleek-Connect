import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { createUserSupabase } from '@/lib/supabase/server';
import styles from '../addresses/addresses.module.css';
import { DeleteAccountForm } from './DeleteAccountForm';
import privacy from './privacy.module.css';

export const metadata: Metadata = { title: 'Privacy and your data', robots: { index: false, follow: false } };

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <p className={styles.muted}>
          <Link href="/account">Account</Link>
        </p>
        <h1>Privacy and your data</h1>
        <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
          <YourData />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function YourData() {
  await connection();
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <p className={styles.muted}>
        <Link href="/account?next=/account/privacy">Sign in with Google</Link> to download or delete your data.
      </p>
    );
  }
  const { data: blocker } = await supabase.rpc('account_deletion_blocker');

  return (
    <>
      <p className={styles.muted}>
        See what we keep about you in our <Link href="/privacy">Privacy notice</Link>. Here you can take a copy of it, or have it
        removed.
      </p>

      <section className={styles.panel} aria-labelledby="export-title">
        <h2 id="export-title">Download your data</h2>
        <p className={styles.muted}>
          A file with your account details, addresses, saved Mobile Money numbers, saved items, bag, orders, returns, support
          cases and reviews. It opens in any text editor.
        </p>
        <a className={`${styles.primary} ${privacy.download}`} href="/account/privacy/export" download>
          Download my data
        </a>
      </section>

      <section className={`${styles.panel} ${privacy.danger}`} aria-labelledby="delete-title">
        <h2 id="delete-title">Delete your account</h2>
        <p className={styles.muted}>This removes your sign-in and everything you saved: addresses, Mobile Money numbers, bag, saved items and reviews.</p>
        <p className={styles.muted}>
          Your past orders stay in our records, because we need them for accounting and refunds, but your name, phone number,
          address, directions and Mobile Money number are removed from them. Messages we had queued for you are dropped, and
          photos you sent with a return are deleted. This can’t be undone.
        </p>
        {blocker ? (
          <p role="status" className={privacy.blocked}>
            {blocker}
          </p>
        ) : (
          <DeleteAccountForm />
        )}
      </section>
    </>
  );
}
