'use client';

import { useState } from 'react';
import type { Product } from '@sleek/shared';
import { ProductCard } from '@/components/ProductCard';
import styles from './store.module.css';

type Sort = 'newest' | 'price-asc' | 'price-desc';

/** A store's products with section tabs (when the store has sections), a search box and a sort order. */
export function StoreProducts({ products, sections }: { products: Product[]; sections: { id: string; name: string; productSlugs: string[] }[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const section = sections.find((s) => s.id === active);
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const matches = (p: Product) => {
    const haystack = `${p.name} ${p.brand ?? ''} ${p.summary ?? ''}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  };
  const inSection = section ? products.filter((p) => section.productSlugs.includes(p.slug)) : products;
  const filtered = inSection.filter(matches);
  // Products arrive newest first, so "newest" keeps that order.
  const shown = sort === 'newest' ? filtered : [...filtered].sort((a, b) => (sort === 'price-asc' ? a.price - b.price : b.price - a.price));
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
      {products.length > 4 && (
        <div className={styles.tools}>
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search this store" aria-label="Search this store" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort products">
            <option value="newest">Newest</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </div>
      )}
      {shown.length === 0 ? (
        <p className={styles.empty}>Nothing matches. {query && <>Try fewer words, or <button type="button" onClick={() => setQuery('')}>clear the search</button>.</>}</p>
      ) : (
        <div className={styles.grid}>
          {shown.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      )}
    </>
  );
}
