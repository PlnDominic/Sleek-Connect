'use client';

import Link from 'next/link';
import { useMemo, useSyncExternalStore } from 'react';
import type { Product } from '@sleek/shared';
import { ProductCard } from '@/components/ProductCard';
import listing from '@/components/listing/listing.module.css';
import styles from '../account.module.css';

// The same list the product pages keep (see RecentProducts): read from the browser as a raw string so it is stable between renders.
const KEY = 'sleek-connect:recent:v1';
const EMPTY = '[]';
const subscribe = () => () => undefined;
const snapshot = () => {
  try {
    return localStorage.getItem(KEY) ?? EMPTY;
  } catch {
    return EMPTY;
  }
};

export function RecentlyViewed() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const items = useMemo<Product[]>(() => {
    try {
      const value: unknown = JSON.parse(raw);
      return Array.isArray(value) ? (value as Product[]).slice(0, 12) : [];
    } catch {
      return [];
    }
  }, [raw]);
  if (items.length === 0) {
    return (
      <div className={styles.emptyCard}>
        <strong>Nothing viewed yet</strong>
        <span className={styles.muted}>Products you open will show up here.</span>
        <Link href="/shop">Browse the shop</Link>
      </div>
    );
  }
  return (
    <div className={listing.grid}>
      {items.map((p) => (
        <ProductCard key={p.slug} product={p} />
      ))}
    </div>
  );
}
