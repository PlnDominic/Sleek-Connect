import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { formatPrice, formatPriceOr } from '@sleek/shared';
import { Logo } from '@/components/Logo';
import { formatDateTime, paymentSummary } from '@/lib/orders';
import { getCustomerOrder } from '../data';
import { PrintButton } from './PrintButton';
import styles from './receipt.module.css';

export const metadata: Metadata = {
  title: 'Receipt',
  robots: { index: false, follow: false },
};

export default function ReceiptPage({ params }: PageProps<'/orders/[token]/receipt'>) {
  return (
    <main className={styles.page}>
      <Suspense fallback={<p>Loading your receipt…</p>}>
        <Receipt params={params} />
      </Suspense>
    </main>
  );
}

async function Receipt({ params }: { params: PageProps<'/orders/[token]/receipt'>['params'] }) {
  const { token } = await params;
  const order = await getCustomerOrder(token);
  if (!order) notFound();

  if (!order.paid_at) {
    return (
      <div className={styles.sheet}>
        <Logo />
        <p>The receipt for order {order.order_number} will be ready once it has been paid{order.payment_method === 'cod' ? ' (when the rider collects the cash)' : ''}.</p>
        <Link href={`/orders/${token}`}>Back to your order</Link>
      </div>
    );
  }

  return (
    <>
      <div className={styles.toolbar}>
        <Link href={`/orders/${token}`}>← Back to your order</Link>
        <PrintButton />
      </div>
      <article className={styles.sheet} aria-labelledby="receipt-title">
        <header className={styles.header}>
          <Logo />
          <div className={styles.headerText}>
            <h1 id="receipt-title">Receipt</h1>
            <span>Order {order.order_number}</span>
            <span>Paid {formatDateTime(order.paid_at)}</span>
          </div>
        </header>

        <dl className={styles.facts}>
          <div>
            <dt>Billed to</dt>
            <dd>
              {order.customer_name}
              <br />
              {order.phone}
            </dd>
          </div>
          <div>
            <dt>Deliver to</dt>
            <dd>
              {order.area}
              {order.ghanapost_gps && (
                <>
                  <br />
                  {order.ghanapost_gps}
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>Paid with</dt>
            <dd>{paymentSummary(order)}</dd>
          </div>
        </dl>

        <table className={styles.lines}>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit price</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={`${item.name}-${item.size_label}`}>
                <td>
                  {item.name}
                  {item.size_label && <span className={styles.size}>{item.size_label}</span>}
                  {item.batches.length > 0 && (
                    <span className={styles.size}>
                      Batch {item.batches.map((b) => `${b.code}${b.expires_on ? `, exp. ${b.expires_on}` : ''}`).join('; ')}
                    </span>
                  )}
                </td>
                <td>{item.quantity}</td>
                <td>{formatPrice(item.unit_price_ghs)}</td>
                <td>{formatPrice(item.line_total_ghs)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={3}>
                Subtotal
              </th>
              <td>{formatPrice(order.subtotal_ghs)}</td>
            </tr>
            <tr>
              <th scope="row" colSpan={3}>
                Delivery ({order.delivery_option})
              </th>
              <td>{order.delivery_fee_ghs === 0 ? 'Free' : formatPriceOr(order.delivery_fee_ghs, 'To be confirmed')}</td>
            </tr>
            <tr className={styles.total}>
              <th scope="row" colSpan={3}>
                Total paid
              </th>
              <td>{formatPriceOr(order.total_ghs, 'To be confirmed')}</td>
            </tr>
          </tfoot>
        </table>

        <footer className={styles.footer}>
          Sleek Connect Store · Accra, Ghana. Keep this receipt for returns and
          refunds.
        </footer>
      </article>
    </>
  );
}
