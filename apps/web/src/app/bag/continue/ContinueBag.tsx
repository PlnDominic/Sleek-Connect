'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import type { Product } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';

interface Line {
  product: Product;
  sizeId?: string;
  qty: number;
}

/** Puts the app's bag into this device's bag, then opens checkout. Safe to open twice: a line is never counted twice. */
export function ContinueBag({ lines, skipped }: { lines: Line[]; skipped: number }) {
  const { items, add, setQty } = useBag();
  const router = useRouter();
  const itemsRef = useRef(items);
  const addRef = useRef(add);
  const setQtyRef = useRef(setQty);
  const started = useRef(false);

  useEffect(() => {
    itemsRef.current = items;
    addRef.current = add;
    setQtyRef.current = setQty;
  });

  useEffect(() => {
    if (started.current || lines.length === 0) return;
    // The bag restores itself from this device after the page mounts, so give it a moment before adding to it.
    const timer = setTimeout(() => {
      started.current = true;
      for (const line of lines) {
        const existing = itemsRef.current.find((i) => i.slug === line.product.slug && i.sizeId === line.sizeId);
        if (existing) setQtyRef.current(line.product.slug, line.sizeId, Math.max(existing.qty, line.qty));
        else addRef.current(line.product, line.sizeId, line.qty);
      }
      router.replace('/checkout');
    }, 150);
    return () => clearTimeout(timer);
  }, [lines, router]);

  if (lines.length === 0) {
    return (
      <div role="status">
        <h1>We couldn’t carry your bag over</h1>
        <p>
          None of the items are on sale right now{skipped > 0 ? ' or the link was incomplete' : ''}. You can{' '}
          <Link href="/shop">keep shopping</Link> or <Link href="/bag">open your bag</Link>.
        </p>
      </div>
    );
  }
  return <p role="status">Preparing your checkout…</p>;
}
