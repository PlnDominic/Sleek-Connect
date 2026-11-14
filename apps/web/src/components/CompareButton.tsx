'use client';
import type { Product } from '@sleek/shared';
import { useCompare } from './CompareProvider';
import styles from './compare.module.css';
export function CompareButton({ product }: { product: Product }) {
  const { has, toggle, products } = useCompare();
  const selected = has(product.slug);
  const disabled = !selected && products.length >= 4;
  return <label className={styles.cardControl}><input type="checkbox" checked={selected} disabled={disabled} onChange={() => toggle(product)} /> Compare</label>;
}
