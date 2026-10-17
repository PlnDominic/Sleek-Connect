import { createHash } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { formatDateTime } from '@/lib/orders';
import { photoUrl } from '@/lib/photos';
import { getCustomerOrder } from '../data';
import { ReturnForm } from './ReturnForm';
import styles from '../../../help/help.module.css';

export const metadata: Metadata = { title: 'Request a return', robots: { index: false, follow: false } };

export default function ReturnPage({ params }: PageProps<'/orders/[token]/return'>) {
  return (
    <>
      <SiteHeader />
      <main>
        <Suspense fallback={<div className={`container ${styles.main}`}>Loading your order…</div>}>
          <ReturnDetails params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function ReturnDetails({ params }: { params: PageProps<'/orders/[token]/return'>['params'] }) {
  const { token } = await params;
  const order = await getCustomerOrder(token);
  if (!order) notFound();
  const items = order.items.filter((i) => i.quantity > i.return_requested);

  return (
    <>
      <div className={styles.hero}>
        <div className="container">
          <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
            <Link href={`/orders/${token}`}>Order {order.order_number}</Link>
            <span aria-hidden="true">/</span>
            <span aria-current="page">Request a return</span>
          </nav>
          <h1>Request a return</h1>
          {order.return_open && order.return_until && (
            <p>
              Choose what you’re returning and tell us why. Returns for this order are open until{' '}
              {formatDateTime(order.return_until)}. <Link href="/help#returns">How returns work</Link>
            </p>
          )}
        </div>
      </div>
      <div className={`container ${styles.main} ${styles.narrow}`}>
        {!order.return_open ? (
          <section className={styles.panel}>
            <p>
              {order.status === 'delivered'
                ? 'The return window for this order has closed.'
                : 'You can request a return once your order has been delivered.'}{' '}
              If something is wrong, <Link href={`/help/report?order=${token}`}>report a problem</Link> and we’ll help.
            </p>
            <Link href={`/orders/${token}`} className={styles.secondary}>
              Back to your order
            </Link>
          </section>
        ) : items.length === 0 ? (
          <section className={styles.panel}>
            <p>Everything in this order is already in a return. You can follow it on your order page.</p>
            <Link href={`/orders/${token}`} className={styles.secondary}>
              Back to your order
            </Link>
          </section>
        ) : (
          <ReturnForm
            token={token}
            // Must match public.return_photo_folder: staff can read photo paths, so they never contain the token.
            photoFolder={createHash('sha256').update(token.toLowerCase()).digest('hex')}
            orderNumber={order.order_number}
            items={items.map((i) => ({
              id: i.id,
              name: i.name,
              sizeLabel: i.size_label,
              available: i.quantity - i.return_requested,
              returnable: i.returnable,
              returnNote: i.return_note,
              image: i.image_key,
              photo: photoUrl(i.photo_path) ?? null,
              tint: i.tint,
              kind: i.kind,
            }))}
          />
        )}
      </div>
    </>
  );
}
