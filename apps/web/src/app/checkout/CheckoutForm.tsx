'use client';

import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  deliveryAreas,
  deliveryFees,
  formatPrice,
  formatPriceOr,
  momoNetworks,
  pending,
  sampleCustomer,
  type MomoNetwork,
} from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import styles from './checkout.module.css';

type DeliveryWindow = 'standard' | 'sameDay';
type PaymentMethod = 'momo' | 'card';
type Status = 'idle' | 'awaitingApproval' | 'cardUnavailable';

export function CheckoutForm() {
  const { lines, subtotal } = useBag();
  const [deliveryWindow, setDeliveryWindow] = useState<DeliveryWindow>('standard');
  const [method, setMethod] = useState<PaymentMethod>('momo');
  const [network, setNetwork] = useState<MomoNetwork>('mtn');
  const [wallet, setWallet] = useState(sampleCustomer.phone);
  const [status, setStatus] = useState<Status>('idle');

  const networkLabel = momoNetworks.find((n) => n.id === network)!.label;
  const fee = deliveryFees[deliveryWindow];
  const total = fee === null ? null : subtotal + fee;
  const walletDisplay = wallet.trim() || 'your phone';

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    // Payment provider integration is not built yet; this mirrors the designed approval flow.
    setStatus(method === 'momo' ? 'awaitingApproval' : 'cardUnavailable');
  };

  const choosePayment = (next: PaymentMethod) => {
    setMethod(next);
    setStatus('idle');
  };

  return (
    <main className={styles.main}>
      <form id="checkout-form" className={styles.forms} onSubmit={onSubmit}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>1. Delivery details</h2>
          <div className={styles.fieldGrid}>
            <Field id="fn" label="Full name">
              <input id="fn" name="name" type="text" autoComplete="name" required defaultValue={sampleCustomer.name} />
            </Field>
            <Field id="ph" label="Phone number">
              <input id="ph" name="phone" type="tel" autoComplete="tel" required defaultValue={sampleCustomer.phone} />
            </Field>
            <Field id="area" label="Area in Accra">
              <select id="area" name="area" defaultValue={sampleCustomer.area}>
                {deliveryAreas.map((area) => (
                  <option key={area}>{area}</option>
                ))}
              </select>
            </Field>
            <Field id="gps" label="GhanaPost GPS address">
              <input id="gps" name="gps" type="text" placeholder="e.g. GA-000-0000" />
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
            <input id="dir" name="directions" type="text" placeholder="Landmark, gate colour, house number" />
          </Field>
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>Delivery window</legend>
            <div className={styles.windowGrid}>
              <label className={styles.choice} data-checked={deliveryWindow === 'standard'}>
                <input type="radio" name="window" checked={deliveryWindow === 'standard'} onChange={() => setDeliveryWindow('standard')} />
                <span>
                  <strong>Standard</strong>
                  <span>
                    {pending.deliveryDays} working days · {formatPriceOr(deliveryFees.standard, '[fee]')}
                  </span>
                </span>
              </label>
              <label className={styles.choice} data-checked={deliveryWindow === 'sameDay'}>
                <input type="radio" name="window" checked={deliveryWindow === 'sameDay'} onChange={() => setDeliveryWindow('sameDay')} />
                <span>
                  <strong>Same day</strong>
                  <span>
                    Order before {pending.sameDayCutoffTime} · {formatPriceOr(deliveryFees.sameDay, '[fee]')}
                  </span>
                </span>
              </label>
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
                        <input
                          type="radio"
                          name="net"
                          checked={network === n.id}
                          onChange={() => {
                            setNetwork(n.id);
                            setStatus('idle');
                          }}
                        />
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
      </form>

      <aside className={styles.summary} aria-labelledby="summary-title">
        <h2 id="summary-title" className={styles.summaryTitle}>
          Order summary
        </h2>
        {lines.length === 0 && (
          <p className={styles.note}>
            Your bag is empty. <Link href="/">Continue shopping</Link>
          </p>
        )}
        {lines.map((line) => (
          <div key={`${line.slug}-${line.sizeId}`} className={styles.line}>
            <ProductImage
              image={line.product.image}
              tint={line.product.tint}
              kind={line.product.kind}
              alt=""
              sizes="64px"
              className={styles.lineImage}
            />
            <span className={styles.lineText}>
              <strong>{line.product.name}</strong>
              <span>
                {line.sizeLabel ? `${line.sizeLabel} · ` : ''}Qty {line.qty}
              </span>
            </span>
            <strong className={styles.linePrice}>{formatPrice(line.lineTotal)}</strong>
          </div>
        ))}
        <div className={styles.promo}>
          <label htmlFor="promo" className="visually-hidden">
            Promo code
          </label>
          <input id="promo" type="text" placeholder="Promo code" />
          <button type="button">Apply</button>
        </div>
        <label className={styles.giftCheck}>
          <input type="checkbox" />
          This is a gift (wrap it and hide prices)
        </label>
        <dl className={styles.totals}>
          <div>
            <dt>Subtotal</dt>
            <dd>{formatPrice(subtotal)}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>{formatPriceOr(fee, '[fee]')}</dd>
          </div>
          <div className={styles.totalRow}>
            <dt>Total</dt>
            <dd>{formatPriceOr(total, '[total]')}</dd>
          </div>
        </dl>
        <button
          type="submit"
          form="checkout-form"
          className={styles.payButton}
          disabled={lines.length === 0 || status === 'awaitingApproval'}
        >
          {status === 'awaitingApproval' ? 'Waiting for approval...' : method === 'momo' ? `Pay with ${networkLabel}` : 'Pay by card'}
        </button>
        {status === 'awaitingApproval' && (
          <div role="status" className={styles.statusPanel}>
            <strong>Check your phone</strong>
            <span>
              We sent a {networkLabel} prompt to {walletDisplay}. Enter your PIN to approve. We never see your PIN.
            </span>
          </div>
        )}
        {status === 'cardUnavailable' && (
          <p role="status" className={styles.note}>
            Card payments are coming soon. Please pay with Mobile Money for now.
          </p>
        )}
        {method === 'momo' && status === 'idle' && (
          <p className={styles.note}>
            You&apos;ll get a prompt on {walletDisplay}. Enter your PIN to approve. We never see or store your PIN.
          </p>
        )}
      </aside>
    </main>
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
