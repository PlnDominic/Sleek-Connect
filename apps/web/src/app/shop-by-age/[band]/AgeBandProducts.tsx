'use client';

import { useState } from 'react';
import type { KidsFilter, Product } from '@sleek/shared';
import { ProductCard } from '@/components/ProductCard';
import styles from './shop-by-age.module.css';

const filters: { id: KidsFilter | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'bath', label: 'Bath & skin' },
  { id: 'toys', label: 'Toys' },
  { id: 'clothing', label: 'Clothing' },
];

export function AgeBandProducts({ products, bandLabel }: { products: Product[]; bandLabel: string }) {
  const [filter, setFilter] = useState<KidsFilter | 'all'>('all');
  const shown = filter === 'all' ? products : products.filter((p) => p.kidsFilter === filter);

  return (
    <>
      <div className={styles.toolbar}>
        <div role="group" aria-label="Product type" className={styles.filters}>
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={f.id === filter}
              onClick={() => setFilter(f.id)}
              className={styles.filter}
            >
              {f.label}
            </button>
          ))}
        </div>
        <h2 id="results-title" className={styles.count} aria-live="polite">
          {shown.length} {shown.length === 1 ? 'product' : 'products'} for {bandLabel}
        </h2>
      </div>
      {shown.length > 0 ? (
        <div className={styles.grid}>
          {shown.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>Nothing here yet for this age. Try another filter or age band.</p>
      )}
    </>
  );
}
