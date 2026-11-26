import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountView } from '../AccountView';
import styles from '../account.module.css';

export const metadata: Metadata = { title: 'Account details', robots: { index: false, follow: false } };

export default function AccountDetailsPage() {
  return (
    <>
      <h1>Account details</h1>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <AccountView mode="details" />
      </Suspense>
    </>
  );
}
