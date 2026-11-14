'use server';

import type { Product } from '@sleek/shared';
import { getProductsBySlugs } from '@/lib/catalog';

/** Current details of the saved products, in the order given. Unknown or unpublished ones are left out. */
export async function loadSavedProducts(slugs: unknown): Promise<Product[]> {
  if (!Array.isArray(slugs)) return [];
  const clean = [...new Set(slugs.filter((s): s is string => typeof s === 'string' && /^[a-z0-9-]{1,120}$/.test(s)))];
  return clean.length ? getProductsBySlugs(clean.slice(0, 200)) : [];
}
