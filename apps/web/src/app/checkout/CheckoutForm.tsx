'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { defaultDeliveryArea, formatPrice, formatPriceOr, momoNetworks, sampleCustomer, type MomoNetwork } from '@sleek/shared';
import { useBag, type ResolvedBagItem } from '@sleek/shared/bag';
import { useAuth } from '@/components/AuthProvider';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { estimate, quote, type DeliveryConfig } from '@/lib/delivery';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { placeOrder, type PlaceOrderResult } from './actions';
import { useOrderStatus, type OrderStatus } from './useOrderStatus';
import styles from './checkout.module.css';

type PaymentMethod = 'momo' | 'card';

type PlacedOrder = Omit<Extract<PlaceOrderResult, { ok: true }>, 'ok'> & { items: ResolvedBagItem[] };

interface CheckoutFormProps {
  delivery: DeliveryConfig;
}

interface SavedAddress {
  id: string;
  label: string | null;
  recipient_name: string;
  phone: string;
  area: string;
  ghanapost_gps: string | null;
  directions: string | null;
  is_default: boolean;
}

interface SavedMethod {
  id: string;
  network: MomoNetwork;
  wallet_number: string;
  label: string | null;
  is_default: boolean;
}

const digitsOf = (n: string) => n.replace(/\D/g, '');

const clockTime = new Intl.DateTimeFormat('en-GH', { hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Accra' });

const paidStatuses: OrderStatus['status'][] = ['paid', 'packed', 'out_for_delivery', 'delivered'];

export function CheckoutForm({ delivery }: CheckoutFormProps) {
  const bag = useBag();
  const { user, consented } = useAuth();
  const areas = delivery.areas.map((a) => a.name);
  const formRef = useRef<HTMLFormElement>(null);
  const [area, setArea] = useState(areas.includes(defaultDeliveryArea) ? defaultDeliveryArea : (areas[0] ?? ''));
  const [chosenId, setChosenId] = useState(delivery.options[0]?.id ?? '');
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [saveAddress, setSaveAddress] = useState(true);
  // Estimates depend on the time of day, so they're refined once the page is in the browser.
  const [now, setNow] = useState<Date>();
  const [method, setMethod] = useState<PaymentMethod>('momo');
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState('');
  const [methods, setMethods] = useState<SavedMethod[]>([]);
  const [saveWallet, setSaveWallet] = useState(true);
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

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);

  const fillAddress = (a: SavedAddress) => {
    const form = formRef.current;
    if (!form) return;
    const set = (name: string, value: string | null) => {
      (form.elements.namedItem(name) as HTMLInputElement).value = value ?? '';
    };
    set('name', a.recipient_name);
    set('phone', a.phone);
    set('gps', a.ghanapost_gps);
    set('directions', a.directions);
    if (areas.includes(a.area)) setArea(a.area);
    setSaveAddress(false);
  };

  // Signed-in shoppers can pick a saved address; the default one fills the form.
  const signedIn = Boolean(user && consented);
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    createBrowserSupabase()
      .from('customer_addresses')
      .select('id, label, recipient_name, phone, area, ghanapost_gps, directions, is_default')
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setAddresses(data);
        const preferred = data.find((a) => a.is_default);
        const form = formRef.current;
        if (preferred && form && !(form.elements.namedItem('name') as HTMLInputElement).value) fillAddress(preferred);
      });
    return () => {
      cancelled = true;
    };
    // fillAddress only touches the form and area state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  // Signed-in shoppers can also pick a saved Mobile Money number; the default one fills the field.
  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    createBrowserSupabase()
      .from('saved_payment_methods')
      .select('id, network, wallet_number, label, is_default')
      .order('is_default', { ascending: false })
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled || !data) return;
        setMethods(data);
        const preferred = data.find((m) => m.is_default);
        if (preferred) {
          setNetwork((current) => (current === 'mtn' ? preferred.network : current));
          setWallet((current) => current || preferred.wallet_number);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  const matchesSaved = methods.some((m) => m.network === network && digitsOf(m.wallet_number) === digitsOf(wallet));
  const canSaveWallet = signedIn && methods.length < 5 && digitsOf(wallet).length >= 9 && !matchesSaved;

  const networkLabel = momoNetworks.find((n) => n.id === network)!.label;
  const walletDisplay = wallet.trim() || 'your phone';
  // Prices follow the area's zone and free delivery (the database recalculates them when the order is placed).
  const quotes = new Map(delivery.options.map((o) => [o.id, quote(delivery, area, o.id, bag.subtotal)]));
  const deliveryId = quotes.get(chosenId)?.available ? chosenId : (delivery.options.find((o) => quotes.get(o.id)?.available)?.id ?? '');
  const fee = quotes.get(deliveryId)?.fee ?? null;
  const freeOption = delivery.options.find((o) => o.freeEligible && quotes.get(o.id)?.available);
  const toFree = delivery.freeThreshold !== null && freeOption ? delivery.freeThreshold - bag.subtotal : null;

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
        saveAddress: signedIn && saveAddress,
        saveWallet: canSaveWallet && saveWallet,
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
      <form id="checkout-form" ref={formRef} className={styles.forms} onSubmit={onSubmit}>
        <fieldset disabled={!!placed} className={styles.fieldset}>
          <div className={styles.forms}>
            <section className={styles.panel}>
              <h2 className={styles.panelTitle}>1. Delivery details</h2>
              {addresses.length > 0 && (
                <Field id="saved" label="Saved addresses">
                  <select
                    id="saved"
                    defaultValue=""
                    onChange={(e) => {
                      const chosen = addresses.find((a) => a.id === e.target.value);
                      if (chosen) fillAddress(chosen);
                    }}
                  >
                    <option value="" disabled>
                      Choose a saved address
                    </option>
                    {addresses.map((a) => (
                      <option key={a.id} value={a.id}>
                        {[a.label, a.recipient_name, a.area].filter(Boolean).join(' · ')}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <div className={styles.fieldGrid}>
                <Field id="fn" label="Full name">
                  <input id="fn" name="name" type="text" autoComplete="name" required placeholder={sampleCustomer.name} />
                </Field>
                <Field id="ph" label="Phone number">
                  <input id="ph" name="phone" type="tel" autoComplete="tel" required placeholder={sampleCustomer.phone} />
                </Field>
                <Field id="area" label="Area in Accra">
                  <select id="area" name="area" required value={area} onChange={(e) => setArea(e.target.value)}>
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
              {signedIn && (
                <label className={styles.giftCheck}>
                  <input type="checkbox" checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />
                  Save this address to my account
                </label>
              )}
              <fieldset className={styles.fieldset}>
                <legend className={styles.legend}>Delivery window</legend>
                <div className={styles.windowGrid}>
                  {delivery.options.map((option) => {
                    const q = quotes.get(option.id)!;
                    return (
                      <label
                        key={option.id}
                        className={styles.choice}
                        data-checked={deliveryId === option.id}
                        data-disabled={!q.available || undefined}
                      >
                        <input
                          type="radio"
                          name="window"
                          disabled={!q.available}
                          checked={deliveryId === option.id}
                          onChange={() => setChosenId(option.id)}
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <span>
                            {q.available
                              ? `${estimate(option, now)} · ${q.free ? 'Free' : formatPriceOr(q.fee, '[fee]')}`
                              : `Not available in ${area}`}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {toFree !== null && toFree > 0 && !placed && (
                  <p className={styles.note}>
                    Add {formatPrice(toFree)} more for free {freeOption!.label.toLowerCase()} delivery.
                  </p>
                )}
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
                    {methods.length > 0 && (
                      <Field id="saved-momo" label="Saved numbers">
                        <select
                          id="saved-momo"
                          value={methods.find((m) => m.network === network && digitsOf(m.wallet_number) === digitsOf(wallet))?.id ?? ''}
                          onChange={(e) => {
                            const chosen = methods.find((m) => m.id === e.target.value);
                            if (!chosen) return;
                            setNetwork(chosen.network);
                            setWallet(chosen.wallet_number);
                          }}
                        >
                          <option value="">Use a different number</option>
                          {methods.map((m) => (
                            <option key={m.id} value={m.id}>
                              {[m.label, momoNetworks.find((n) => n.id === m.network)?.label, `•••• ${digitsOf(m.wallet_number).slice(-4)}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </option>
                          ))}
                        </select>
                      </Field>
                    )}
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
                    {canSaveWallet && (
                      <label className={styles.saveWallet}>
                        <input type="checkbox" checked={saveWallet} onChange={(e) => setSaveWallet(e.target.checked)} />
                        Save this number for next time
                      </label>
                    )}
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
            <ProductImage image={item.image} photo={item.photo} tint={item.tint} kind={item.kind} alt="" sizes="64px" className={styles.lineImage} />
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
            <dd>{shownFee === 0 ? 'Free' : formatPriceOr(shownFee, '[fee]')}</dd>
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
