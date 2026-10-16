'use client';

import Link from 'next/link';
import { useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  defaultDeliveryArea,
  formatPrice,
  formatPriceOr,
  momoNetworks,
  pending,
  sampleCustomer,
  type MomoNetwork,
} from '@sleek/shared';
import { useBag, type ResolvedBagItem } from '@sleek/shared/bag';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import type { DeliveryOption } from '@/lib/catalog';
import { placeOrder, type PlaceOrderResult } from './actions';
import { useOrderStatus, type OrderStatus } from './useOrderStatus';
import styles from './checkout.module.css';

type PaymentMethod = 'momo' | 'card';

type PlacedOrder = Omit<Extract<PlaceOrderResult, { ok: true }>, 'ok'> & { items: ResolvedBagItem[] };

interface CheckoutFormProps {
  areas: string[];
  deliveryOptions: DeliveryOption[];
}

const windowDetail = (option: DeliveryOption) =>
  option.id === 'same_day' ? `Order before ${pending.sameDayCutoffTime}` : `${pending.deliveryDays} working days`;

const clockTime = new Intl.DateTimeFormat('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });

const paidStatuses: OrderStatus['status'][] = ['paid', 'packed', 'out_for_delivery', 'delivered'];

export function CheckoutForm({ areas, deliveryOptions }: CheckoutFormProps) {
  const bag = useBag();
  const [deliveryId, setDeliveryId] = useState(deliveryOptions[0]?.id ?? '');
  const [method, setMethod] = useState<PaymentMethod>('momo');
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [cardNotice, setCardNotice] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [placing, startPlacing] = useTransition();
  const live = useOrderStatus(placed?.orderToken ?? null);
  const isPaid = !!live && paidStatuses.includes(live.status);

  // The bag is kept until the order is paid, so a failed or expired payment can simply be retried.
  const { clear } = bag;
  useEffect(() => {
    if (isPaid) clear();
  }, [isPaid, clear]);

  const networkLabel = momoNetworks.find((n) => n.id === network)!.label;
  const walletDisplay = wallet.trim() || 'your phone';
  const fee = deliveryOptions.find((o) => o.id === deliveryId)?.fee ?? null;

  // Once placed, the summary shows what the server priced, not the (now empty) bag.
  const items = placed?.items ?? bag.items;
  const subtotal = placed?.subtotal ?? bag.subtotal;
  const shownFee = placed ? placed.deliveryFee : fee;
  const total = placed ? placed.total : fee === null ? null : bag.subtotal + fee;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (method === 'card') {
      setCardNotice(true);
      return;
    }

    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? '').trim();
    const orderedItems = bag.items;

    startPlacing(async () => {
      const result = await placeOrder({
        customer: {
          name: text('name'),
          phone: text('phone'),
          area: text('area'),
          ghanapostGps: text('gps') || undefined,
          directions: text('directions') || undefined,
        },
        deliveryOption: deliveryId,
        payment: { method: 'momo', network, wallet },
        items: orderedItems.map((i) => ({ slug: i.slug, size: i.sizeId, quantity: i.qty })),
        isGift: form.get('gift') === 'on',
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPlaced({
        orderNumber: result.orderNumber,
        orderToken: result.orderToken,
        reservedUntil: result.reservedUntil,
        subtotal: result.subtotal,
        deliveryFee: result.deliveryFee,
        total: result.total,
        payment: result.payment,
        items: orderedItems,
      });
    });
  };

  const choosePayment = (next: PaymentMethod) => {
    setMethod(next);
    setCardNotice(false);
  };

  return (
    <main className={styles.main}>
      <form id="checkout-form" className={styles.forms} onSubmit={onSubmit}>
        <fieldset disabled={!!placed} className={styles.fieldset}>
          <div className={styles.forms}>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>1. Delivery details</h2>
              <div className={styles.fieldGrid}>
                <Field id="fn" label="Full name">
                  <input id="fn" name="name" type="text" autoComplete="name" required placeholder={sampleCustomer.name} />
                </Field>
                <Field id="ph" label="Phone number">
                  <input id="ph" name="phone" type="tel" autoComplete="tel" required placeholder={sampleCustomer.phone} />
                </Field>
                <Field id="area" label="Area in Accra">
                  <select id="area" name="area" required defaultValue={areas.includes(defaultDeliveryArea) ? defaultDeliveryArea : areas[0]}>
                    {areas.map((area) => (
                      <option key={area}>{area}</option>
                    ))}
                  </select>
                </Field>
                <Field id="gps" label="GhanaPost GPS address">
                  <input id="gps" name="gps" type="text" maxLength={20} placeholder="e.g. GA-000-0000" />
                </Field>
              </div>
              <Field
                id="dir"
                label={
                  <>
                    Directions for the rider <span className={styles.optional}>(optional)</span>
                  </>
                }
              >
                <input id="dir" name="directions" type="text" maxLength={300} placeholder="Landmark, gate colour, house number" />
              </Field>
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Delivery window</legend>
                <div className={styles.windowGrid}>
                  {deliveryOptions.map((option) => (
                    <label key={option.id} className={styles.choice} data-checked={deliveryId === option.id}>
                      <input
                        type="radio"
                        name="window"
                        checked={deliveryId === option.id}
                        onChange={() => setDeliveryId(option.id)}
                      />
                      <span>
                        <strong>{option.label}</strong>
                        <span>
                          {windowDetail(option)} · {formatPriceOr(option.fee, '[fee]')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </section>

            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>2. Payment</h2>
              <div className={styles.payOption} data-checked={method === 'momo'}>
                <label className={styles.payHeader}>
                  <input type="radio" name="pay" checked={method === 'momo'} onChange={() => choosePayment('momo')} />
                  <span className={styles.payText}>
                    <strong>Mobile Money</strong>
                    <span>Approve the payment prompt on your phone</span>
                  </span>
                  <span className={styles.payIcon}>
                    <Icon name="phone" size={22} />
                  </span>
                </label>
                {method === 'momo' && (
                  <>
                    <fieldset className={styles.fieldset}>
                      <legend className={styles.legend}>Network</legend>
                      <div className={styles.networks}>
                        {momoNetworks.map((n) => (
                          <label key={n.id} className={styles.network} data-checked={network === n.id}>
                            <input type="radio" name="net" checked={network === n.id} onChange={() => setNetwork(n.id)} />
                            {n.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className={styles.walletField}>
                      <Field id="momo" label="Wallet number">
                        <input
                          id="momo"
                          name="wallet"
                          type="tel"
                          inputMode="tel"
                          required
                          placeholder={sampleCustomer.phone}
                          value={wallet}
                          onChange={(e) => setWallet(e.target.value)}
                        />
                      </Field>
                    </div>
                  </>
                )}
              </div>
              <div className={styles.payOption} data-checked={method === 'card'}>
                <label className={styles.payHeader}>
                  <input type="radio" name="pay" checked={method === 'card'} onChange={() => choosePayment('card')} />
                  <span className={styles.payText}>
                    <strong>Debit or credit card</strong>
                    <span>Visa, Mastercard</span>
                  </span>
                  <span className={styles.payIcon}>
                    <Icon name="card" size={22} />
                  </span>
                </label>
              </div>
            </section>
          </div>
        </fieldset>
      </form>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>
          Order summary
        </h2>
        {items.length === 0 && (
          <p className={styles.note}>
            Your bag is empty. <Link href="/">Continue shopping</Link>
          </p>
        )}
        {items.map((item) => (
          <div key={`${item.slug}-${item.sizeId}`} className={styles.line}>
            <ProductImage image={item.image} tint={item.tint} kind={item.kind} alt="" sizes="64px" className={styles.lineImage} />
            <span className={styles.lineText}>
              <strong>{item.name}</strong>
              <span>
                {item.sizeLabel ? `${item.sizeLabel} · ` : ''}Qty {item.qty}
              </span>
            </span>
            <strong className={styles.linePrice}>{formatPrice(item.lineTotal)}</strong>
          </div>
        ))}
        {!placed && (
          <>
            <div className={styles.promo}>
              <label htmlFor="promo" className="visually-hidden">
                Promo code
              </label>
              <input id="promo" type="text" placeholder="Promo code" />
              <button type="button">Apply</button>
            </div>
            <label className={styles.giftCheck}>
              <input type="checkbox" name="gift" form="checkout-form" />
              This is a gift (wrap it and hide prices)
            </label>
          </>
        )}
        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{formatPriceOr(shownFee, '[fee]')}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt>Total</dt>
            <dd>{formatPriceOr(total, '[total]')}</dd>
          </div>
        </dl>

        {placed ? (
          <OrderProgress
            order={placed}
            live={live}
            prompt={`Approve the ${networkLabel} prompt sent to ${walletDisplay} with your PIN. We never see your PIN.`}
            onRetry={() => setPlaced(null)}
          />
        ) : (
          <>
            <button type="submit" form="checkout-form" className={styles.payButton} disabled={items.length === 0 || placing}>
              {placing ? 'Placing your order...' : method === 'momo' ? `Pay with ${networkLabel}` : 'Pay by card'}
            </button>
            {error && (
              <p role="alert" className={styles.error}>
                {error}
              </p>
            )}
            {cardNotice && (
              <p role="status" className={styles.note}>
                Card payments are coming soon. Please pay with Mobile Money for now.
              </p>
            )}
            {method === 'momo' && !cardNotice && (
              <p className={styles.note}>
                You&apos;ll get a prompt on {walletDisplay}. Enter your PIN to approve. We never see or store your PIN.
              </p>
            )}
          </>
        )}
      </aside>
    </main>
  );
}

interface OrderProgressProps {
  order: PlacedOrder;
  live: OrderStatus | null;
  prompt: string;
  onRetry: () => void;
}

/** What happened to the order after it was placed, kept up to date from the server. */
function OrderProgress({ order, live, prompt, onRetry }: OrderProgressProps) {
  const status = live?.status ?? 'pending_payment';
  const paymentStatus = live?.paymentStatus ?? null;
  const heldUntil = clockTime.format(new Date(order.reservedUntil));

  if (paidStatuses.includes(status)) {
    return (
      <div role="status" className={styles.statusPanel} data-tone="success">
        <strong>Payment received</strong>
        <span>Thank you. Order {order.orderNumber} is confirmed and we&apos;re getting it ready.</span>
        <Link href={`/orders/${order.orderToken}`} className={styles.retry}>
          View order and receipt
        </Link>
      </div>
    );
  }

  if (paymentStatus === 'succeeded') {
    return (
      <div role="status" className={styles.statusPanel}>
        <strong>We&apos;re checking your payment</strong>
        <span>
          We received a payment for order {order.orderNumber} that needs a manual check. We&apos;ll contact you about it.
        </span>
      </div>
    );
  }

  if (status === 'cancelled') {
    const message =
      paymentStatus === 'failed'
        ? `The payment for order ${order.orderNumber} didn’t go through, so the order was cancelled. You haven’t been charged.`
        : `Order ${order.orderNumber} wasn’t paid in time, so it was cancelled and the items were released.`;
    return (
      <div role="status" className={styles.statusPanel} data-tone="problem">
        <strong>{paymentStatus === 'failed' ? 'Payment not completed' : 'Order expired'}</strong>
        <span>{message} Your bag still has everything in it.</span>
        <button type="button" className={styles.retry} onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (order.payment.kind === 'unavailable') {
    return (
      <div role="status" className={styles.statusPanel}>
        <strong>Order {order.orderNumber} placed</strong>
        <span>
          Your items are held until {heldUntil}. {order.payment.reason}
        </span>
        <Link href={`/orders/${order.orderToken}`} className={styles.statusLink}>
          Follow this order
        </Link>
      </div>
    );
  }

  return (
    <div role="status" className={styles.statusPanel}>
      <strong>Check your phone</strong>
      <span>
        Order {order.orderNumber} is waiting for payment. {prompt} Your items are held until {heldUntil}.
      </span>
      <Link href={`/orders/${order.orderToken}`} className={styles.statusLink}>
        Follow this order
      </Link>
      {order.payment.testMode && (
        <span className={styles.testNote}>
          Test mode: no real prompt was sent. Run <code>npm run payments:simulate -- {order.orderNumber} succeeded</code>{' '}
          to approve it.
        </span>
      )}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {children}
    </div>
  );
}
