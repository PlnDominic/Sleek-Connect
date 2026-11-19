'use client';
import Link from 'next/link';
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Product } from '@sleek/shared';
import styles from './product.module.css';
const KEY = 'sleek-connect:recent:v1';
const EMPTY = '[]';
// Read as a raw string: useSyncExternalStore needs a value that is identical between calls until storage changes.
const subscribe = () => () => undefined;
const snapshot = () => { try { return localStorage.getItem(KEY) ?? EMPTY; } catch { return EMPTY; } };
const serverSnapshot = () => EMPTY;
function parse(raw: string, slug: string): Product[] { try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? (value as Product[]).filter((p) => p.slug !== slug).slice(0, 4) : []; } catch { return []; } }
export function RecentProducts({ current }: { current: Product }) {
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const items = useMemo(() => parse(raw, current.slug), [raw, current.slug]);
  useEffect(() => { try { const previous = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Product[]; const next = [current, ...previous.filter((p) => p.slug !== current.slug)].slice(0, 8); localStorage.setItem(KEY, JSON.stringify(next)); } catch {} }, [current]);
  if (!items.length) return null;
  return <section className={`container ${styles.relatedSection}`} aria-labelledby="recent-title"><h2 id="recent-title" className={styles.relatedTitle}>Recently viewed</h2><div className={styles.relatedGrid}>{items.map((p) => <Link key={p.slug} href={`/products/${p.slug}`} className={styles.relatedCard}><strong className={styles.relatedName}>{p.name}</strong><span className={styles.relatedPrice}>GH₵ {p.price.toFixed(2)}</span></Link>)}</div></section>;
}
