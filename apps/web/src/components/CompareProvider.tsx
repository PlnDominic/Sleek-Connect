'use client';
import Link from 'next/link';
import { createContext, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Product } from '@sleek/shared';
import styles from './compare.module.css';
const KEY = 'sleek-connect:compare:v1';
const MAX = 4;
interface CompareValue { products: Product[]; has: (slug: string) => boolean; toggle: (product: Product) => void; clear: () => void; }
const CompareContext = createContext<CompareValue | null>(null);
// The list lives in localStorage; it is read as the raw string so each call returns the same value until it changes.
const EMPTY = '[]';
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) listener(); };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}
function snapshot(): string { try { return localStorage.getItem(KEY) ?? EMPTY; } catch { return EMPTY; } }
const serverSnapshot = () => EMPTY;
function parse(raw: string): Product[] { try { const value: unknown = JSON.parse(raw); return Array.isArray(value) ? (value as Product[]).slice(0, MAX) : []; } catch { return []; } }
export function CompareProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const raw = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const stored = useMemo(() => parse(raw), [raw]);
  const current = products.length ? products : stored;
  const save = (next: Product[]) => { setProducts(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {} listeners.forEach((l) => l()); };
  const value = useMemo<CompareValue>(() => ({
    products: current,
    has: (slug) => current.some((p) => p.slug === slug),
    toggle: (product) => save(current.some((p) => p.slug === product.slug) ? current.filter((p) => p.slug !== product.slug) : current.length < MAX ? [...current, product] : current),
    clear: () => save([]),
  }), [current]);
  return <CompareContext value={value}>{children}<CompareBar /></CompareContext>;
}
export function useCompare() { const value = useContext(CompareContext); if (!value) throw new Error('useCompare must be used inside <CompareProvider>'); return value; }
function CompareBar() {
  const { products, clear } = useCompare();
  if (!products.length) return null;
  return <aside className={styles.bar} aria-label="Product comparison"><span><strong>{products.length}</strong> selected to compare</span><button type="button" onClick={clear}>Clear</button><Link href="/compare">Compare products</Link></aside>;
}
