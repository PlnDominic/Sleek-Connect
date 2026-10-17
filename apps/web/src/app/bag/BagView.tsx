'use client';

import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { MAX_ITEM_QTY, useBag } from '@sleek/shared/bag';
import { useAuth } from '@/components/AuthProvider';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import styles from './bag.module.css';

export function BagView() {
  const { items, count, subtotal, syncing, setQty, remove } = useBag();
  const { user, consented } = useAuth();
  const soldOut = items.filter((i) => i.inStock === false);

  return (
    <main className={`container ${styles.main}`}>
      <div className={styles.titleRow}>
        <h1>Your bag</h1>
        {count > 0 && (
          <span className={styles.count}>
            {count} {count === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>

      {syncing && (
        <p role="status" className={styles.note}>
          Loading your saved bag…
        </p>
      )}

      {items.length === 0 && !syncing ? (
        <div className={styles.empty}>
          <p>Your bag is empty.</p>
          <Link href="/" className={styles.primary}>
            Continue shopping
          </Link>
        </div>
      ) : (
        <div className={styles.layout}>
          <ul className={styles.lines} aria-label="Items in your bag">
            {items.map((item) => {
              const label = item.sizeLabel ? `${item.name}, ${item.sizeLabel}` : item.name;
              return (
                <li key={`${item.slug}-${item.sizeId ?? ''}`} className={styles.line}>
                  <ProductImage
                    image={item.image}
                    tint={item.tint}
                    kind={item.kind}
                    alt=""
                    sizes="96px"
                    className={styles.lineImage}
                  />
                  <div className={styles.lineInfo}>
                    <Link href={`/products/${item.slug}`} className={styles.lineName}>
                      {item.name}
                    </Link>
                    <span className={styles.muted}>
                      {item.sizeLabel ? `${item.sizeLabel} · ` : ''}
                      {formatPrice(item.unitPrice)} each
                    </span>
                    {item.warning && (
                      <span className={styles.safety}>
                        <Icon name="alert" size={14} strokeWidth={2} /> {item.warning}
                      </span>
                    )}
                    {item.inStock === false && <span className={styles.warning}>Sold out: remove to continue</span>}
                    <div className={styles.lineControls}>
                      <div className={styles.qty}>
                        <button
                          type="button"
                          aria-label={`Decrease quantity of ${label}`}
                          disabled={item.qty <= 1}
                          onClick={() => setQty(item.slug, item.sizeId, item.qty - 1)}
                        >
                          −
                        </button>
                        <span aria-label={`Quantity of ${label}`}>{item.qty}</span>
                        <button
                          type="button"
                          aria-label={`Increase quantity of ${label}`}
                          disabled={item.qty >= MAX_ITEM_QTY}
                          onClick={() => setQty(item.slug, item.sizeId, item.qty + 1)}
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        className={styles.remove}
                        aria-label={`Remove ${label}`}
                        onClick={() => remove(item.slug, item.sizeId)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <strong className={styles.lineTotal}>{formatPrice(item.lineTotal)}</strong>
                </li>
              );
            })}
          </ul>

          <aside className={styles.summary} aria-label="Bag summary">
            <dl className={styles.totals}>
              <div>
                <dt>Subtotal</dt>
                <dd>{formatPrice(subtotal)}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>Calculated at checkout</dd>
              </div>
            </dl>
            {soldOut.length > 0 ? (
              <span className={`${styles.primary} ${styles.disabled}`} aria-disabled="true">
                Checkout
              </span>
            ) : (
              <Link href="/checkout" className={styles.primary}>
                Checkout
              </Link>
            )}
            <p className={styles.note}>
              {user && consented ? (
                'Your bag is saved to your account, so it follows you to any device.'
              ) : user ? (
                <>
                  <Link href="/account">Confirm your account</Link> to save this bag to it.
                </>
              ) : (
                <>
                  <Link href="/account?next=/bag">Sign in with Google</Link> to keep your bag on all your devices.
                </>
              )}
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
