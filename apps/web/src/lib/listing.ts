import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import type { Category, Product } from '@sleek/shared';
import { allPublishedProducts, getCategories } from './catalog';
import { expandQuery } from './search-terms';
import { createSupabase } from './supabase/server';
interface DiscoveryMetric { slug: string; average_rating: number; review_count: number; popularity: number; }

/** Products per listing page. */
export const PAGE_SIZE = 24;

export const sortOptions = {
  featured: 'Featured',
  relevance: 'Best match',
  newest: 'Newest',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  rating: 'Top rated',
  popular: 'Best selling',
} as const;
export type SortKey = keyof typeof sortOptions;

export const priceBands = [
  { id: 'under-50', label: 'Under GH₵ 50', min: 0, max: 50 },
  { id: '50-100', label: 'GH₵ 50 – 100', min: 50, max: 100 },
  { id: '100-200', label: 'GH₵ 100 – 200', min: 100, max: 200 },
  { id: '200-plus', label: 'GH₵ 200 and over', min: 200, max: Infinity },
] as const;

/** The filters a listing understands, read from the URL. All facets combine with AND (PRD FR-013). */
export interface Filters {
  category: string[];
  brand: string[];
  price: string[];
  age: string[];
  skin: string[];
  shade: string[];
  rating: string[];
  sale: boolean;
  inStock: boolean;
  sort: SortKey;
  page: number;
}

type Params = Record<string, string | string[] | undefined>;
const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

export function readFilters(params: Params, defaultSort: SortKey): Filters {
  const sort = typeof params.sort === 'string' && params.sort in sortOptions ? (params.sort as SortKey) : defaultSort;
  const page = Number(params.page);
  return {
    category: list(params.category),
    brand: list(params.brand),
    price: list(params.price),
    age: list(params.age),
    skin: list(params.skin),
    shade: list(params.shade),
    rating: list(params.rating),
    sale: params.sale === '1',
    inStock: params.stock === '1',
    sort,
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

type FacetKey = 'category' | 'brand' | 'price' | 'age' | 'skin' | 'shade' | 'rating';

const matches: Record<FacetKey, (p: Product, values: string[]) => boolean> = {
  category: (p, v) => v.includes(p.category),
  brand: (p, v) => Boolean(p.brand && v.includes(p.brand)),
  price: (p, v) => priceBands.some((b) => v.includes(b.id) && p.price >= b.min && p.price < b.max),
  age: (p, v) => Boolean(p.ageBands?.some((a) => v.includes(a))),
  skin: (p, v) => Boolean(p.skinTypes?.some((s) => v.includes(s))),
  shade: (p, v) => Boolean(p.shades?.some((s) => v.includes(s))),
  rating: (p, v) => v.some((value) => (p.rating ?? 0) >= Number(value)),
};

function passes(p: Product, f: Filters, skip?: FacetKey): boolean {
  for (const key of Object.keys(matches) as FacetKey[]) {
    if (key !== skip && f[key].length > 0 && !matches[key](p, f[key])) return false;
  }
  if (f.sale && !p.was) return false;
  if (f.inStock && p.inStock === false) return false;
  return true;
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
  checked: boolean;
}

export interface Facet {
  key: FacetKey;
  label: string;
  options: FacetOption[];
}

/** Each option's count is what you'd get by adding it to the other active filters. */
function facet(key: FacetKey, label: string, scope: Product[], f: Filters, values: { value: string; label: string }[]): Facet | null {
  if (values.length === 0) return null;
  const base = scope.filter((p) => passes(p, f, key));
  return {
    key,
    label,
    options: values.map((v) => ({
      ...v,
      count: base.filter((p) => matches[key](p, [v.value])).length,
      checked: f[key].includes(v.value),
    })),
  };
}

const unique = (values: (string | undefined)[]) => [...new Set(values.filter((v): v is string => Boolean(v)))].sort();

export interface Listing {
  products: Product[];
  total: number;
  page: number;
  pages: number;
  facets: Facet[];
  saleCount: number;
  inStockCount: number;
}

/** Filters, sorts and pages a set of products. `rank` orders "featured" or "relevance" results. */
export function buildListing(
  scope: Product[],
  f: Filters,
  context: { categories: Category[]; ageBands: { id: string; label: string }[]; rank?: Map<string, number>; showCategories: boolean },
): Listing {
  const filtered = scope.filter((p) => passes(p, f));
  const rank = (p: Product) => context.rank?.get(p.slug) ?? Number.MAX_SAFE_INTEGER;
  const byName = (a: Product, b: Product) => a.name.localeCompare(b.name);
  const sorted = [...filtered].sort((a, b) => {
    switch (f.sort) {
      case 'price-asc':
        return a.price - b.price || byName(a, b);
      case 'price-desc':
        return b.price - a.price || byName(a, b);
      case 'newest':
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || byName(a, b);
      case 'rating':
        return (b.rating ?? 0) - (a.rating ?? 0) || (b.reviewCount ?? 0) - (a.reviewCount ?? 0) || byName(a, b);
      case 'popular':
        return (b.popularity ?? 0) - (a.popularity ?? 0) || byName(a, b);
      default:
        return (a.inStock === false ? 1 : 0) - (b.inStock === false ? 1 : 0) || rank(a) - rank(b) || (b.popularity ?? 0) - (a.popularity ?? 0) || byName(a, b);
    }
  });

  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(f.page, pages);
  const inScope = (id: string) => scope.some((p) => p.category === id);

  const facets = [
    context.showCategories
      ? facet('category', 'Category', scope, f, context.categories.filter((c) => inScope(c.id)).map((c) => ({ value: c.id, label: c.name })))
      : null,
    facet('age', 'Age', scope, f, context.ageBands.filter((a) => scope.some((p) => p.ageBands?.includes(a.id as never))).map((a) => ({ value: a.id, label: a.label }))),
    facet('skin', 'Skin type', scope, f, unique(scope.flatMap((p) => p.skinTypes ?? [])).map((v) => ({ value: v, label: v }))),
    facet('shade', 'Shade', scope, f, unique(scope.flatMap((p) => p.shades ?? [])).map((v) => ({ value: v, label: v }))),
    facet('rating', 'Rating', scope, f, [
      { value: '4', label: '4 stars & up' },
      { value: '3', label: '3 stars & up' },
    ]),
    facet('brand', 'Brand', scope, f, unique(scope.map((p) => p.brand)).map((v) => ({ value: v, label: v }))),
    facet('price', 'Price', scope, f, priceBands.map((b) => ({ value: b.id, label: b.label }))),
  ].filter((x): x is Facet => x !== null && x.options.some((o) => o.count > 0 || o.checked));

  return {
    products: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total: sorted.length,
    page,
    pages,
    facets,
    saleCount: scope.filter((p) => passes(p, { ...f, sale: false }) && p.was).length,
    inStockCount: scope.filter((p) => passes(p, { ...f, inStock: false }) && p.inStock !== false).length,
  };
}

/** Everything the listing pages need, cached together (the catalogue is small enough to filter in memory). */
export async function getListingData() {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const [products, categories, bestSellers, metrics] = await Promise.all([
    allPublishedProducts(),
    getCategories(),
    createSupabase().from('merchandising_slots').select('position, products(slug)').eq('slot', 'home_best_sellers'),
    createSupabase().rpc('get_product_discovery_metrics' as never),
  ]);
  // "Featured": best sellers first, in their order, then the rest.
  const featured: [string, number][] = (bestSellers.data ?? []).flatMap((r) => (r.products ? [[r.products.slug, r.position]] : []));
  const bySlug = new Map((metrics.data as unknown as DiscoveryMetric[] ?? []).map((m) => [m.slug, m]));
  const enriched = products.map((p) => {
    const m = bySlug.get(p.slug);
    return m ? { ...p, rating: Number(m.average_rating), reviewCount: m.review_count, popularity: Number(m.popularity) } : p;
  });
  return { products: enriched, categories, featured };
}

/** Slugs matching a search query (or a synonym of it, slightly lower), best match first. */
export async function searchProducts(query: string): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const supabase = createSupabase();
  const variants = expandQuery(query);
  const results = await Promise.all(
    variants.map(async (q) => {
      const { data, error } = await supabase.rpc('search_products', { p_query: q, p_limit: 200 });
      if (error) throw new Error(`Search failed: ${error.message}`);
      return data;
    }),
  );
  const best = new Map<string, number>();
  results.forEach((rows, i) => {
    for (const r of rows) {
      const score = r.score * (i === 0 ? 1 : 0.95);
      if (score > (best.get(r.slug) ?? -1)) best.set(r.slug, score);
    }
  });
  return [...best].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([slug]) => slug);
}

/** Builds a listing URL from the current filters with some values changed. */
export function listingHref(path: string, f: Filters, change: Partial<Record<string, string | string[] | null>>, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams(extra);
  const current: Record<string, string | string[] | null> = {
    category: f.category,
    brand: f.brand,
    price: f.price,
    age: f.age,
    skin: f.skin,
    shade: f.shade,
    rating: f.rating,
    sale: f.sale ? '1' : null,
    stock: f.inStock ? '1' : null,
    sort: f.sort,
    page: f.page > 1 ? String(f.page) : null,
    ...change,
  };
  for (const [key, value] of Object.entries(current)) {
    for (const v of Array.isArray(value) ? value : value ? [value] : []) params.append(key, v);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}
