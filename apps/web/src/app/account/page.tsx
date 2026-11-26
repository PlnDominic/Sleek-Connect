import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AccountView } from './AccountView';
import styles from './account.module.css';

export const metadata: Metadata = {
  title: 'Your account',
};

export default function AccountPage() {
  return (
    <>
      <h1>Your account</h1>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <AccountView mode="overview" />
      </Suspense>
    </>
  );
}
