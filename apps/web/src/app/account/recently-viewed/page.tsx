import type { Metadata } from 'next';
import { RecentlyViewed } from './RecentlyViewed';
import styles from '../account.module.css';

export const metadata: Metadata = { title: 'Recently viewed', robots: { index: false, follow: false } };

export default function RecentlyViewedPage() {
  return (
    <>
      <h1>Recently viewed</h1>
      <p className={styles.muted}>Products you looked at on this device. They are kept in your browser only, never on our servers.</p>
      <RecentlyViewed />
    </>
  );
}
