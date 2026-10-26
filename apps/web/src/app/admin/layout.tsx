import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Suspense } from 'react';
import { AdminGate } from './AdminGate';
import styles from './admin.module.css';

// The admin console uses Inter throughout, like a typical operations dashboard.
const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s | Sleek Connect Store admin' },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className={`${styles.root} ${inter.className}`}>
      <Suspense fallback={<p className={styles.loading}>Loading…</p>}>
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}
