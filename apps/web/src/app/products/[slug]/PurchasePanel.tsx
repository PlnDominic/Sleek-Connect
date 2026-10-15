'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatPrice, unitPrice, type Product } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';
import { Icon } from '@/components/Icon';
import styles from './product.module.css';

export function PurchasePanel({ product }: { product: Product }) {
  const { add } = useBag();
  const router = useRouter();
  const [sizeId, setSizeId] = useState(product.defaultSize);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

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
                onClick={() => setSizeId(size.id)}
                className={styles.sizeButton}
              >
                {size.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={styles.buyRow}>
        <div className={styles.qty}>
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            −
          </button>
          <span aria-live="polite" aria-label={`Quantity ${qty}`}>
            {qty}
          </span>
          <button type="button" aria-label="Increase quantity" onClick={() => setQty((q) => q + 1)}>
            +
          </button>
        </div>
        <button type="button" className={styles.addButton} onClick={addToBag}>
          {added ? 'Added to bag' : 'Add to bag'}
        </button>
        <button
          type="button"
          className={styles.momoButton}
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
