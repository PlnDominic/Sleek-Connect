import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminGate } from './AdminGate';
import styles from './admin.module.css';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Sleek Connect admin' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className={styles.root}>
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}
