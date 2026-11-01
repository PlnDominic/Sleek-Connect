'use client';

import { useState } from 'react';
import type { Product } from '@sleek/shared';
import { ProductCard } from '@/components/ProductCard';
import styles from './store.module.css';

/** A store's products with section tabs (shown only when the store has sections). */
export function StoreProducts({ products, sections }: { products: Product[]; sections: { id: string; name: string; productSlugs: string[] }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const section = sections.find((s) => s.id === active);
  const shown = section ? products.filter((p) => section.productSlugs.includes(p.slug)) : products;
  return (
    <>
      {sections.length > 0 && (
        <div className={styles.sections} role="group" aria-label="Sections">
          <button type="button" aria-pressed={active === null} onClick={() => setActive(null)}>
            All <span>{products.length}</span>
          </button>
          {sections.map((s) => (
            <button key={s.id} type="button" aria-pressed={active === s.id} onClick={() => setActive(s.id)}>
              {s.name} <span>{s.productSlugs.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className={styles.grid}>
        {shown.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </div>
    </>
  );
}
