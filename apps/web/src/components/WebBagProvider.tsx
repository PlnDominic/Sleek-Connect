'use client';

import type { ReactNode } from 'react';
import { BagProvider, type BagStorage } from '@sleek/shared/bag';

const browserStorage = (): BagStorage | undefined => (typeof window === 'undefined' ? undefined : window.localStorage);

/** The shopping bag, kept in localStorage so it survives reloads. */
export function WebBagProvider({ children }: { children: ReactNode }) {
  return <BagProvider storage={browserStorage}>{children}</BagProvider>;
}
