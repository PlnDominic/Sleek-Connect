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
  if (vendor && (vendor.status === 'active' || vendor.status === 'pending')) {
    let badges = { orders: 0, messages: 0 };
    if (vendor.live && session.state === 'ready') {
      const [orders, unread] = await Promise.all([session.supabase.rpc('vendor_orders'), session.supabase.rpc('vendor_unread_messages')]);
      const waiting = ((orders.data ?? []) as unknown as { shipment_status: string; order_status: string }[]).filter(
        (o) => o.shipment_status === 'pending' && o.order_status !== 'cancelled',
      );
      badges = { orders: waiting.length, messages: typeof unread.data === 'number' ? unread.data : 0 };
    }
    const stage = vendor.status === 'pending' ? 'pending' : vendor.live ? 'live' : 'approved';
    return (
      <VendorShell
        store={vendor.name}
        slug={vendor.slug}
        stage={stage}
        badges={badges}
        status={
          vendor.status === 'pending'
            ? { label: 'Application under review', tone: 'warn' }
            : vendor.paused
              ? { label: 'Store paused', tone: 'warn' }
              : vendor.live
                ? { label: 'Store open', tone: 'good' }
                : { label: 'Subscription needed', tone: 'warn' }
        }
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
