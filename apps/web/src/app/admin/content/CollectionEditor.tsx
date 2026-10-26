'use client';

import { useState } from 'react';
import type { ProductRow } from './ContentView';
import admin from '../admin.module.css';
import styles from './content.module.css';

/** Pick, order and remove the products in one featured collection. Sends their web addresses, one per line. */
export function CollectionEditor({ initial, products }: { initial: ProductRow[]; products: ProductRow[] }) {
  const [items, setItems] = useState(initial);
  const chosen = new Set(items.map((p) => p.slug));
  const move = (i: number, by: number) =>
    setItems((all) => {
      const next = [...all];
      const [p] = next.splice(i, 1);
      next.splice(i + by, 0, p);
      return next;
    });

  return (
    <div className={styles.picker}>
      <input type="hidden" name="slugs" value={items.map((p) => p.slug).join('\n')} />
      {items.length === 0 ? (
        <p className={admin.muted}>No products yet. Add some below.</p>
      ) : (
        <ol className={styles.pickList}>
          {items.map((p, i) => (
            <li key={p.slug}>
              <span className={styles.pickName}>
                {p.name}
                {!p.is_published && <span className={admin.badge}>not on the store</span>}
              </span>
              <span className={styles.pickActions}>
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${p.name} up`}>
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label={`Move ${p.name} down`}>
                  ↓
                </button>
                <button type="button" onClick={() => setItems((all) => all.filter((x) => x.slug !== p.slug))} aria-label={`Remove ${p.name}`}>
                  ×
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      <div className={admin.row}>
        <label className={admin.field}>
          <span>Add a product</span>
          <select
            value=""
            onChange={(e) => {
              const p = products.find((x) => x.slug === e.target.value);
              if (p) setItems((all) => [...all, p]);
            }}
          >
            <option value="">Choose a product…</option>
            {products
              .filter((p) => !chosen.has(p.slug))
              .map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.name}
                  {p.is_published ? '' : ' (draft)'}
                </option>
              ))}
          </select>
        </label>
        {items.length > 0 && (
          <button type="button" className={admin.linkButton} onClick={() => setItems([])}>
            Clear list
          </button>
        )}
      </div>
    </div>
  );
}
