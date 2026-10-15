'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { pending, type Product } from '@sleek/shared';
import styles from './product.module.css';

const tabs = [
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'safety', label: 'Safety & age' },
  { id: 'batch', label: 'Batch & expiry' },
  { id: 'use', label: 'How to use' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function ProductInfoTabs({ product }: { product: Product }) {
  const [active, setActive] = useState<TabId>('ingredients');
  const baseId = useId();
  const details = product.details;

  const onKeyDown = (event: KeyboardEvent) => {
    const index = tabs.findIndex((t) => t.id === active);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = tabs[(index + step + tabs.length) % tabs.length];
    setActive(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Product information" className={styles.tablist} onKeyDown={onKeyDown}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => setActive(tab.id)}
            className={styles.tab}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`} className={styles.tabPanel}>
        {active === 'ingredients' && (
          <div className={styles.prose}>
            <p>
              <strong>Full ingredient list (INCI)</strong>
            </p>
            <p className={styles.muted}>{pending.ingredientList}</p>
            {details?.freeFrom && (
              <div className={styles.tagList}>
                {details.freeFrom.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            )}
          </div>
        )}
        {active === 'safety' && (
          <div className={styles.factGrid}>
            <Fact label="Recommended age" value={details?.recommendedAge ?? '[Recommended age]'} />
            <Fact label="FDA Ghana registration" value={pending.fdaRegistration} />
            <Fact label="Warnings" value={details?.warnings ?? '[Warnings as printed on the pack]'} small />
          </div>
        )}
        {active === 'batch' && (
          <div className={styles.prose}>
            <p className={styles.muted}>
              The batch and expiry of the exact unit we pack for you are printed on your receipt and shown in your order.
            </p>
            <div className={styles.factGrid}>
              <Fact label="Current stock batch" value={pending.batchNumber} />
              <Fact label="Earliest expiry in stock" value={pending.expiryDate} />
              <Fact label="Period after opening" value={pending.periodAfterOpening} />
            </div>
          </div>
        )}
        {active === 'use' && (
          <p className={`${styles.prose} ${styles.muted}`}>{details?.howToUse ?? '[Directions as printed on the pack]'}</p>
        )}
      </div>
    </>
  );
}

function Fact({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={styles.fact}>
      <span>{label}</span>
      <strong className={small ? styles.factSmall : undefined}>{value}</strong>
    </div>
  );
}
