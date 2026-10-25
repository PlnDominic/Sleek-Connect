import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import styles from './vendor.module.css';

export const metadata: Metadata = {
  title: { default: 'Your store', template: '%s | Sleek Connect Store' },
  robots: { index: false, follow: false },
};

export default function VendorLayout({ children }: LayoutProps<'/vendor'>) {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <Suspense fallback={<p className={styles.muted}>Loading…</p>}>{children}</Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
