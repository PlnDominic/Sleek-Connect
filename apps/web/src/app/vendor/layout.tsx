import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VendorFrame } from './VendorFrame';
import styles from './vendor.module.css';

export const metadata: Metadata = {
  title: { default: 'Your store', template: '%s | Sleek Connect Store' },
  robots: { index: false, follow: false },
};

export default function VendorLayout({ children }: LayoutProps<'/vendor'>) {
  return (
    <Suspense fallback={<p className={styles.muted} style={{ padding: 40 }}>Loading…</p>}>
      <VendorFrame>{children}</VendorFrame>
    </Suspense>
  );
}
