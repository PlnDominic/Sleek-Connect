'use client';

import type { ReactNode } from 'react';
import type { Product } from '@sleek/shared';
import { useBag } from '@sleek/shared/bag';

interface AddToBagButtonProps {
  product: Product;
  className: string;
  children: ReactNode;
  label?: string;
}

export function AddToBagButton({ product, className, children, label }: AddToBagButtonProps) {
  const { add } = useBag();
  return (
    <button type="button" aria-label={label} className={className} onClick={() => add(product)}>
      {children}
    </button>
  );
}
