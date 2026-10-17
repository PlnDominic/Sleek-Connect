'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Product } from '@sleek/shared';
import { useAuth } from '@/components/AuthProvider';
import { ProductCard } from '@/components/ProductCard';
import { useWishlist } from '@/components/WishlistProvider';
import styles from '@/components/listing/listing.module.css';
import { loadSavedProducts } from './actions';

export function SavedList() {
  const { slugs } = useWishlist();
  const { user, consented } = useAuth();
  const [loaded, setLoaded] = useState<{ key: string; products: Product[] } | null>(null);
  const key = slugs.join(',');

  useEffect(() => {
    let cancelled = false;
    loadSavedProducts(key ? key.split(',') : []).then((products) => {
      if (!cancelled) setLoaded({ key, products });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Unsaving a product hides it straight away; the list reloads in the background.
  const products = (loaded?.products ?? []).filter((p) => slugs.includes(p.slug));

  return (
    <>
      <h2 id="results-count" className={styles.count}>
        {loaded === null ? 'Loading…' : `${products.length} saved ${products.length === 1 ? 'product' : 'products'}`}
      </h2>
      {loaded !== null && products.length === 0 && (
        <div className={styles.empty}>
          <p>Nothing saved yet. Tap the heart on any product to keep it here.</p>
          <Link href="/shop">Browse the shop</Link>
        </div>
      )}
      {products.length > 0 && (
        <div className={styles.grid}>
          {products.map((p) => (
            <ProductCard key={p.slug} product={p} />
          ))}
        </div>
      )}
      {!(user && consented) && products.length > 0 && (
        <p className={styles.note}>
          Saved on this device. <Link href="/account?next=/saved">Sign in with Google</Link> to keep them on all your devices.
        </p>
      )}
    </>
  );
}
