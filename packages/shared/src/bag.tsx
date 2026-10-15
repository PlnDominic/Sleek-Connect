'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSize, unitPrice, type ImageKey, type Product, type ProductKind } from './catalog';

/** What the bag remembers about a line. Prices are re-checked by the server when the order is placed. */
export interface BagItem {
  slug: string;
  name: string;
  sizeId?: string;
  sizeLabel?: string;
  unitPrice: number;
  image?: ImageKey;
  tint: string;
  kind: ProductKind;
  qty: number;
}

export interface ResolvedBagItem extends BagItem {
  lineTotal: number;
}

/** Synchronous key-value storage, e.g. `window.localStorage`. */
export interface BagStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface BagValue {
  items: ResolvedBagItem[];
  count: number;
  subtotal: number;
  add: (product: Product, sizeId?: string, qty?: number) => void;
  clear: () => void;
}

const BagContext = createContext<BagValue | null>(null);
const STORAGE_KEY = 'sleek-connect:bag:v1';

export function bagItemFrom(product: Product, sizeId = product.defaultSize, qty = 1): BagItem {
  return {
    slug: product.slug,
    name: product.name,
    sizeId,
    sizeLabel: getSize(product, sizeId)?.label,
    unitPrice: unitPrice(product, sizeId),
    image: product.image,
    tint: product.tint,
    kind: product.kind,
    qty,
  };
}

function isBagItem(value: unknown): value is BagItem {
  const v = value as BagItem;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.slug === 'string' &&
    typeof v.name === 'string' &&
    typeof v.unitPrice === 'number' &&
    Number.isInteger(v.qty) &&
    v.qty > 0
  );
}

interface BagProviderProps {
  children: ReactNode;
  initialItems?: BagItem[];
  /**
   * When set, the bag is restored from and saved to this storage.
   * Pass a stable function (defined at module level), not an inline arrow.
   */
  storage?: () => BagStorage | undefined;
}

export function BagProvider({ children, initialItems = [], storage }: BagProviderProps) {
  const [items, setItems] = useState<BagItem[]>(initialItems);
  // Nothing is saved until the stored bag has been read, so it is never overwritten.
  const [restored, setRestored] = useState(!storage);

  // Restore after mount so server-rendered markup and the first client render match.
  useEffect(() => {
    if (restored) return;
    try {
      const saved: unknown = JSON.parse(storage?.()?.getItem(STORAGE_KEY) ?? 'null');
      if (Array.isArray(saved)) setItems(saved.filter(isBagItem));
    } catch {
      // Unreadable or blocked storage: start with an empty bag.
    }
    setRestored(true);
  }, [restored, storage]);

  useEffect(() => {
    if (!restored || !storage) return;
    try {
      storage()?.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage full or blocked: the bag still works for this visit.
    }
  }, [items, restored, storage]);

  const value = useMemo<BagValue>(() => {
    const resolved = items.map((item) => ({ ...item, lineTotal: item.unitPrice * item.qty }));
    return {
      items: resolved,
      count: resolved.reduce((sum, i) => sum + i.qty, 0),
      subtotal: resolved.reduce((sum, i) => sum + i.lineTotal, 0),
      add: (product, sizeId = product.defaultSize, qty = 1) =>
        setItems((current) => {
          const existing = current.find((i) => i.slug === product.slug && i.sizeId === sizeId);
          if (existing) {
            return current.map((i) => (i === existing ? { ...i, qty: i.qty + qty } : i));
          }
          return [...current, bagItemFrom(product, sizeId, qty)];
        }),
      clear: () => setItems([]),
    };
  }, [items]);

  return <BagContext value={value}>{children}</BagContext>;
}

export function useBag(): BagValue {
  const value = useContext(BagContext);
  if (!value) throw new Error('useBag must be used inside <BagProvider>');
  return value;
}
