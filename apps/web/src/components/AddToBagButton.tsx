'use client';

import type { ReactNode } from 'react';
import { useBag } from '@sleek/shared/bag';

interface AddToBagButtonProps {
  slug: string;
  sizeId?: string;
  className: string;
  children: ReactNode;
  label?: string;
}

export function AddToBagButton({ slug, sizeId, className, children, label }: AddToBagButtonProps) {
  const { add } = useBag();
  return (
    <button type="button" aria-label={label} className={className} onClick={() => add(slug, sizeId)}>
      {children}
    </button>
  );
}
