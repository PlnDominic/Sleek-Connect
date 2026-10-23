import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { AccountView } from './AccountView';
import styles from './account.module.css';

export const metadata: Metadata = {
  title: 'Your account',
};

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main} ${styles.centered}`}>
        <h1>Your account</h1>
        <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
          <AccountView />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
