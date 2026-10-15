'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { getProduct, getSize, unitPrice, type Product } from './catalog';
import { sampleBag, type BagLine } from './store';

export interface ResolvedBagLine extends BagLine {
  product: Product;
  sizeLabel?: string;
  lineTotal: number;
}

interface BagValue {
  lines: ResolvedBagLine[];
  count: number;
  subtotal: number;
  add: (slug: string, sizeId?: string, qty?: number) => void;
}

const BagContext = createContext<BagValue | null>(null);

/** In-memory shopping bag. Starts from the design's sample bag until a cart API exists. */
export function BagProvider({ children }: { children: ReactNode }) {
  const [bag, setBag] = useState<BagLine[]>(sampleBag);

  const value = useMemo<BagValue>(() => {
    const lines = bag.flatMap((line) => {
      const product = getProduct(line.slug);
      if (!product) return [];
      return [
        {
          ...line,
          product,
          sizeLabel: getSize(product, line.sizeId)?.label,
          lineTotal: unitPrice(product, line.sizeId) * line.qty,
        },
      ];
    });
    return {
      lines,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      subtotal: lines.reduce((sum, l) => sum + l.lineTotal, 0),
      add: (slug, sizeId, qty = 1) =>
        setBag((current) => {
          const existing = current.find((l) => l.slug === slug && l.sizeId === sizeId);
          if (existing) {
            return current.map((l) => (l === existing ? { ...l, qty: l.qty + qty } : l));
          }
          return [...current, { slug, sizeId, qty }];
        }),
    };
  }, [bag]);

  return <BagContext value={value}>{children}</BagContext>;
}

export function useBag(): BagValue {
  const value = useContext(BagContext);
  if (!value) throw new Error('useBag must be used inside <BagProvider>');
  return value;
}
