'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import type { Product } from '@sleek/shared';
import styles from './product.module.css';

const tabs = [
  { id: 'ingredients', label: 'Ingredients' },
  { id: 'safety', label: 'Safety & age' },
  { id: 'batch', label: 'Batch & expiry' },
  { id: 'use', label: 'How to use' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function ProductInfoTabs({ product }: { product: Product }) {
  const [selected, setSelected] = useState<TabId | null>(null);
  const baseId = useId();
  const details = product.details;
  const compliance = product.compliance;
  const batches = product.currentBatches ?? [];

  // A tab appears only when the catalogue has something to show in it.
  const hasContent: Record<TabId, boolean> = {
    ingredients: Boolean(compliance?.ingredients || details?.freeFrom?.length),
    safety: Boolean(
      details?.recommendedAge || compliance?.regulatoryReference || compliance?.countryOfOrigin || details?.warnings,
    ),
    batch: batches.length > 0 || Boolean(compliance?.periodAfterOpening),
    use: Boolean(details?.howToUse),
  };
  const visible = tabs.filter((t) => hasContent[t.id]);
  if (visible.length === 0) return null;
  const active = visible.some((t) => t.id === selected) ? selected! : visible[0].id;

  const onKeyDown = (event: KeyboardEvent) => {
    const index = visible.findIndex((t) => t.id === active);
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    const next = visible[(index + step + visible.length) % visible.length];
    setSelected(next.id);
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Product information" className={styles.tablist} onKeyDown={onKeyDown}>
        {visible.map((tab) => (
          <button
            key={tab.id}
            id={`${baseId}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={tab.id === active}
            aria-controls={`${baseId}-panel`}
            tabIndex={tab.id === active ? 0 : -1}
            onClick={() => setSelected(tab.id)}
            className={styles.tab}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`} className={styles.tabPanel}>
        {active === 'ingredients' && (
          <div className={styles.prose}>
            {compliance?.ingredients && (
              <>
                <p>
                  <strong>Full ingredient list (INCI)</strong>
                </p>
                <p className={styles.muted}>{compliance.ingredients}</p>
              </>
            )}
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
            {details?.recommendedAge && <Fact label="Recommended age" value={details.recommendedAge} />}
            {compliance?.regulatoryReference && <Fact label="FDA Ghana registration" value={compliance.regulatoryReference} />}
            {compliance?.countryOfOrigin && <Fact label="Made in" value={compliance.countryOfOrigin} />}
            {details?.warnings && <Fact label="Warnings" value={details.warnings} small />}
          </div>
        )}
        {active === 'batch' && (
          <div className={styles.prose}>
            <p className={styles.muted}>
              The batch and expiry of the exact unit we pack for you are printed on your receipt and shown in your order.
            </p>
            <div className={styles.factGrid}>
              {batches.map((b) => (
                <Fact
                  key={b.sizeId ?? 'one-size'}
                  label={`Current batch${b.sizeId ? `, ${product.sizes?.find((s) => s.id === b.sizeId)?.label ?? b.sizeId}` : ''}`}
                  value={`${b.batch}${b.expiresOn ? ` · expires ${b.expiresOn}` : ''}`}
                />
              ))}
              {compliance?.periodAfterOpening && <Fact label="Period after opening" value={compliance.periodAfterOpening} />}
            </div>
          </div>
        )}
        {active === 'use' && details?.howToUse && (
          <p className={`${styles.prose} ${styles.muted}`}>{details.howToUse}</p>
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
