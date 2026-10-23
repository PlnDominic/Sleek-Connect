import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { asImageKey, formatPrice, formatPriceOr } from '@sleek/shared';
import { ProductImage } from '@/components/ProductImage';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import {
  buildTimeline,
  finalStatuses,
  formatDate,
  formatDateTime,
  orderHeadline,
  paymentSummary,
  returnReasons,
  returnStatusLabels,
  statusShort,
} from '@/lib/orders';
import { getProductsBySlugs } from '@/lib/catalog';
import { photoUrl } from '@/lib/photos';
import { AutoRefresh } from './AutoRefresh';
import { BuyAgain, CancelOrder } from './OrderActions';
import { getCustomerOrder } from './data';
import styles from './order.module.css';

export const metadata: Metadata = {
  title: 'Your order',
  robots: { index: false, follow: false },
};

export default function OrderPage({ params }: PageProps<'/orders/[token]'>) {
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.main}`}>
        <Suspense fallback={<p className={styles.muted}>Loading your order…</p>}>
          <OrderDetails params={params} />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}

async function OrderDetails({ params }: { params: PageProps<'/orders/[token]'>['params'] }) {
  const { token } = await params;
  const order = await getCustomerOrder(token);
  if (!order) notFound();

  const headline = orderHeadline(order);
  const timeline = buildTimeline(order);
  const live = !finalStatuses.includes(order.status);
  const canReturn = order.return_open && order.items.some((i) => i.quantity > i.return_requested);
  const reorderable = ['delivered', 'cancelled', 'returned'].includes(order.status);
  const slugs = order.items.flatMap((i) => (i.slug ? [i.slug] : []));
  const products = reorderable && slugs.length ? await getProductsBySlugs(slugs) : [];

  return (
    <>
      {live && <AutoRefresh seconds={order.status === 'pending_payment' ? 5 : 30} />}
      <div className={styles.titleRow}>
        <div>
          <h1>Order {order.order_number}</h1>
          <p className={styles.muted}>Placed {formatDateTime(order.created_at)}</p>
        </div>
        <span className={styles.badge} data-status={order.status}>
          {statusShort[order.status]}
        </span>
      </div>

      <section className={styles.hero} data-status={order.status} aria-labelledby="order-headline">
        <div>
          <h2 id="order-headline">{headline.title}</h2>
          <p>{headline.body}</p>
        </div>
        {order.delivery_code && (
          <div className={styles.code}>
            <span>Delivery code</span>
            <strong aria-label={`Delivery code ${order.delivery_code.split('').join(' ')}`}>{order.delivery_code}</strong>
            <span>Give this to the rider</span>
          </div>
        )}
      </section>

      {order.rider && (
        <div className={styles.rider}>
          <span className={styles.avatar} aria-hidden="true" />
          <div>
            <strong>{order.rider.name}</strong>
            <span className={styles.muted}>Your rider · {order.rider.vehicle}</span>
          </div>
        </div>
      )}
      {!order.rider && order.courier_reference && (
        <p className={styles.muted}>Courier tracking reference: {order.courier_reference}</p>
      )}

      <div className={styles.layout}>
        <section className={styles.panel} aria-labelledby="progress-title">
          <h2 id="progress-title" className={styles.panelTitle}>
            Order progress
          </h2>
          <ol className={styles.timeline}>
            {timeline.map((step) => (
              <li key={step.key} data-state={step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
                <span className={styles.dot} aria-hidden="true">
                  {step.state === 'done' ? '✓' : ''}
                </span>
                <span className={styles.stepText}>
                  <strong>{step.title}</strong>
                  {step.detail && <span>{step.detail}</span>}
                  {step.at && <span>{formatDateTime(step.at)}</span>}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <div className={styles.side}>
          <section className={styles.panel} aria-labelledby="items-title">
            <h2 id="items-title" className={styles.panelTitle}>
              Items
            </h2>
            <ul className={styles.items}>
              {order.items.map((item) => (
                <li key={`${item.name}-${item.size_label}`}>
                  <ProductImage
                    image={asImageKey(item.image_key)}
                    photo={photoUrl(item.photo_path)}
                    tint={item.tint ?? '#EAEAEA'}
                    kind={item.kind ?? 'gift'}
                    alt=""
                    sizes="56px"
                    className={styles.itemImage}
                  />
                  <span className={styles.itemText}>
                    {item.slug ? <Link href={`/products/${item.slug}`}>{item.name}</Link> : <strong>{item.name}</strong>}
                    <span>
                      {item.size_label ? `${item.size_label} · ` : ''}Qty {item.quantity}
                    </span>
                    {item.warning_label && <span className={styles.itemWarning}>{item.warning_label}</span>}
                    {item.batches.length > 0 && (
                      <span>
                        Batch{' '}
                        {item.batches
                          .map((b) => `${b.code}${b.expires_on ? ` (expires ${formatDate(b.expires_on)})` : ''}`)
                          .join(', ')}
                      </span>
                    )}
                  </span>
                  <strong>{formatPrice(item.line_total_ghs)}</strong>
                </li>
              ))}
            </ul>
            <dl className={styles.totals}>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPrice(order.subtotal_ghs)}</dd>
              </div>
              <div>
                <dt>Delivery ({order.delivery_option})</dt>
                <dd>{order.delivery_fee_ghs === 0 ? 'Free' : formatPriceOr(order.delivery_fee_ghs, 'To be confirmed')}</dd>
              </div>
              <div className={styles.totalRow}>
                <dt>Total</dt>
                <dd>{formatPriceOr(order.total_ghs, 'To be confirmed')}</dd>
              </div>
            </dl>
          </section>

          <section className={styles.panel} aria-labelledby="delivery-title">
            <h2 id="delivery-title" className={styles.panelTitle}>
              Delivery
            </h2>
            <dl className={styles.facts}>
              <div>
                <dt>Recipient</dt>
                <dd>
                  {order.customer_name}, {order.phone}
                </dd>
              </div>
              <div>
                <dt>Address</dt>
                <dd>
                  {[order.area, order.ghanapost_gps].filter(Boolean).join(' · ')}
                  {order.directions && <span className={styles.block}>{order.directions}</span>}
                </dd>
              </div>
              {order.is_gift && (
                <div>
                  <dt>Gift</dt>
                  <dd>Gift-wrapped, with no prices in the parcel</dd>
                </div>
              )}
              <div>
                <dt>Payment</dt>
                <dd>
                  {paymentSummary(order)}
                  {order.paid_at ? ` · paid ${formatDateTime(order.paid_at)}` : ' · not paid yet'}
                </dd>
              </div>
            </dl>
          </section>

          {order.returns.length > 0 && (
            <section className={styles.panel} aria-labelledby="returns-title">
              <h2 id="returns-title" className={styles.panelTitle}>
                Returns
              </h2>
              <ul className={styles.returns}>
                {order.returns.map((r) => (
                  <li key={r.case_number}>
                    <div className={styles.returnHead}>
                      <strong>{r.case_number}</strong>
                      <span className={styles.returnStatus} data-status={r.status}>
                        {returnStatusLabels[r.status]}
                      </span>
                    </div>
                    <span className={styles.muted}>
                      {returnReasons[r.reason]} · requested {formatDate(r.created_at)}
                    </span>
                    <span>
                      {r.items.map((i) => `${i.quantity} × ${i.name}${i.size_label ? ` (${i.size_label})` : ''}`).join(', ')}
                    </span>
                    {r.decision_note && <span className={styles.muted}>Note from us: {r.decision_note}</span>}
                    {r.refund_amount_ghs !== null && (
                      <span>
                        Refund: {formatPrice(r.refund_amount_ghs)}
                        {r.status === 'refunded' ? ' (sent)' : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {order.return_open && order.return_until && (
            <p className={styles.muted}>
              {canReturn
                ? `You can request a return until ${formatDateTime(order.return_until)}.`
                : 'Everything in this order is already in a return.'}
            </p>
          )}

          <div className={styles.actions}>
            {reorderable && (
              <BuyAgain
                lines={order.items.map((i) => ({ slug: i.slug, sizeCode: i.size_code, quantity: i.quantity, name: i.name }))}
                products={products}
              />
            )}
            {order.can_cancel && <CancelOrder token={token} paid={Boolean(order.paid_at)} />}
            {canReturn && (
              <Link href={`/orders/${token}/return`} className={styles.primary}>
                Request a return
              </Link>
            )}
            {order.paid_at && (
              <Link href={`/orders/${token}/receipt`} className={styles.primary}>
                View receipt
              </Link>
            )}
            <Link href={`/help/report?order=${token}`} className={styles.secondary}>
              Report a problem
            </Link>
            <Link href="/" className={styles.secondary}>
              Continue shopping
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
