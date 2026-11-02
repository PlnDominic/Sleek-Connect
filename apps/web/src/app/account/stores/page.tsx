import type { Metadata } from 'next';
import { Suspense } from 'react';
import { FollowedStores } from '../../saved/FollowedStores';
import styles from '../account.module.css';

export const metadata: Metadata = { title: 'Followed stores', robots: { index: false, follow: false } };

export default function FollowedStoresPage() {
  return (
    <>
      <h1>Followed stores</h1>
      <p className={styles.muted}>Stores you follow. Follow a store from its page to keep it here.</p>
      <Suspense fallback={<p className={styles.muted}>Loading…</p>}>
        <FollowedStores emptyText="You aren’t following any stores yet." />
      </Suspense>
    </>
  );
}
