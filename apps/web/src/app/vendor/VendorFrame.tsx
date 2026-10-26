import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import { getVendorSession } from '@/lib/vendor';
import { VendorShell } from './VendorShell';
import shell from './shell.module.css';

/** Approved vendors get the dashboard frame; everyone else (signing in, applying, waiting) gets a simple centred page. */
export async function VendorFrame({ children }: { children: ReactNode }) {
  const session = await getVendorSession();
  const vendor = session.state === 'ready' ? session.vendor : null;
  if (vendor && vendor.status === 'active') {
    return (
      <VendorShell
        store={vendor.name}
        slug={vendor.slug}
        status={vendor.live ? { label: 'Store open', tone: 'good' } : { label: 'Subscription needed', tone: 'warn' }}
      >
        {children}
      </VendorShell>
    );
  }
  return (
    <div className={shell.plain}>
      <header className={shell.plainBar}>
        <Logo size={20} />
        <Link href="/">Back to the shop</Link>
      </header>
      <main id="main" className={shell.plainMain}>
        {children}
      </main>
    </div>
  );
}
