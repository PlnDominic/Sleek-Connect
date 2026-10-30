import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import styles from '../addresses/addresses.module.css';

export const metadata: Metadata = { title: 'Account deleted', robots: { index: false, follow: false } };

export default function AccountDeletedPage() {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <h1>Your account has been deleted</h1>
        <p className={styles.muted}>
          Your sign-in and saved details are gone, and your name, phone number and address have been removed from your past
          orders. You can keep shopping as a guest, or <Link href="/account">sign in again</Link> to start a new account.
        </p>
        <p>
          <Link href="/shop">Continue shopping</Link>
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
