'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatPrice, isAvailable, unitPrice, type Product } from '@sleek/shared';
import { MAX_ITEM_QTY, useBag } from '@sleek/shared/bag';
import { Icon } from '@/components/Icon';
import styles from './product.module.css';

export function PurchasePanel({ product }: { product: Product }) {
  const { add } = useBag();
  const router = useRouter();
  const [sizeId, setSizeId] = useState(product.defaultSize);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  const available = isAvailable(product, sizeId);

  const addToBag = () => {
    add(product, sizeId, qty);
    setAdded(true);
  };

  return (
    <>
      <div className={styles.priceRow}>
        <strong className={styles.price}>{formatPrice(unitPrice(product, sizeId))}</strong>
        <span className={styles.muted}>VAT included</span>
      </div>

      {product.sizes && product.sizes.length > 1 && (
        <div className={styles.sizeGroup}>
          <span id="size-label" className={styles.label}>
            Size
          </span>
          <div role="group" aria-labelledby="size-label" className={styles.sizes}>
            {product.sizes.map((size) => (
              <button
                key={size.id}
                type="button"
                aria-pressed={size.id === sizeId}
                onClick={() => {
                  setSizeId(size.id);
                  setAdded(false);
                }}
                className={styles.sizeButton}
                data-sold-out={size.inStock === false}
              >
                {size.label}
                {size.inStock === false && <span className="visually-hidden"> (sold out)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {product.warningLabel && (
        <p className={styles.safetyWarning} id="safety-warning">
          <Icon name="alert" size={18} strokeWidth={2} />
          <span>
            <strong>Safety: </strong>
            {product.warningLabel}
          </span>
        </p>
      )}

      <div className={styles.buyRow}>
        <div className={styles.qty}>
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            −
          </button>
          <span aria-live="polite" aria-label={`Quantity ${qty}`}>
            {qty}
          </span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQty((q) => Math.min(MAX_ITEM_QTY, q + 1))}
          >
            +
          </button>
        </div>
        <button
          type="button"
          className={styles.addButton}
          onClick={addToBag}
          disabled={!available}
          aria-describedby={product.warningLabel ? 'safety-warning' : undefined}
        >
          {!available ? 'Sold out' : added ? 'Added to bag' : 'Add to bag'}
        </button>
        <button
          type="button"
          className={styles.momoButton}
          disabled={!available}
          onClick={() => {
            add(product, sizeId, qty);
            router.push('/checkout');
          }}
        >
          <Icon name="phone" size={18} strokeWidth={2} />
          Buy now with MoMo
        </button>
      </div>

      <label className={styles.giftOption}>
        <input type="checkbox" />
        <span>
          <strong>Send as a gift</strong>
          <span className={styles.muted}>Gift wrap, a personal note and no price on the receipt</span>
        </span>
      </label>
    </>
  );
}
