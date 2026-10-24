import {
  categoryFromRow,
  productFromRow,
  productSelect,
  type AgeBand,
  type AgeBandId,
  type Category,
  type CategoryRowLike,
  type ImageKey,
  type Product,
  type ProductRowLike,
  asImageKey,
} from '@sleek/shared';
import { photoUrl, supabase } from './supabase';

function check<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message);
  return data as T;
}

const toProduct = (row: unknown): Product => productFromRow(row as ProductRowLike, photoUrl);

export interface Banner {
  id: string;
  kicker?: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaHref?: string;
  image?: ImageKey;
  theme: 'light' | 'sale' | 'gift';
}

export async function getCategories(): Promise<Category[]> {
  const rows = check(await supabase.from('categories').select('*').order('sort_order'));
  return (rows as CategoryRowLike[]).map(categoryFromRow);
}

export async function getAgeBands(): Promise<AgeBand[]> {
  const rows = check(await supabase.from('age_bands').select('id, label, stage').order('sort_order'));
  return (rows as { id: string; label: string; stage: string }[]).map((b) => ({ id: b.id as AgeBandId, label: b.label, stage: b.stage }));
}

/** Products in a merchandising slot (for example `home_new_arrivals`), in position order. */
async function slotProducts(slot: string): Promise<Product[]> {
  const rows = check(await supabase.from('merchandising_slots').select(`position, products(${productSelect})`).eq('slot', slot).order('position'));
  return (rows as unknown as { products: unknown }[]).flatMap((r) => (r.products ? [toProduct(r.products)] : []));
}

export interface HomeContent {
  hero: Banner | null;
  promos: Banner[];
  newArrivals: Product[];
  bestSellers: Product[];
}

export async function getHome(): Promise<HomeContent> {
  const [banners, newArrivals, bestSellers] = await Promise.all([
    supabase.from('banners').select('*').order('sort_order').order('updated_at', { ascending: false }),
    slotProducts('home_new_arrivals'),
    slotProducts('home_best_sellers'),
  ]);
  const rows = check(banners) as {
    id: string; placement: string; kicker: string | null; title: string; body: string | null;
    cta_label: string | null; cta_href: string | null; image_key: string | null; theme: string;
  }[];
  const toBanner = (b: (typeof rows)[number]): Banner => ({
    id: b.id,
    kicker: b.kicker ?? undefined,
    title: b.title,
    body: b.body ?? undefined,
    ctaLabel: b.cta_label ?? undefined,
    ctaHref: b.cta_href ?? undefined,
    image: asImageKey(b.image_key),
    theme: (b.theme as Banner['theme']) ?? 'light',
  });
  return {
    hero: rows.filter((b) => b.placement === 'home_hero').map(toBanner)[0] ?? null,
    promos: rows.filter((b) => b.placement === 'home_promo').map(toBanner),
    newArrivals,
    bestSellers,
  };
}

/** Every published product, newest first. The catalogue is small, so the app filters it on the device. */
export async function getAllProducts(): Promise<Product[]> {
  const rows = check(await supabase.from('products').select(productSelect).order('created_at', { ascending: false }));
  return (rows as unknown[]).map(toProduct);
}

export async function getProduct(slug: string): Promise<Product | null> {
  const [row, batches] = await Promise.all([
    supabase.from('products').select(productSelect).eq('slug', slug).maybeSingle(),
    supabase.rpc('product_current_batches', { p_slug: slug }),
  ]);
  const data = check(row);
  if (!data) return null;
  const list = (check(batches) ?? []) as { size_code: string; batch_code: string; expires_on: string | null }[];
  return {
    ...toProduct(data),
    currentBatches: list.map((b) => ({ sizeId: b.size_code || undefined, batch: b.batch_code, expiresOn: b.expires_on ?? undefined })),
  };
}

/** Slugs matching a search, best first (typos and synonyms allowed: the same ranking as the website). */
export async function searchSlugs(query: string): Promise<string[]> {
  const rows = check(await supabase.rpc('search_products', { p_query: query, p_limit: 60 })) as { slug: string; score: number }[];
  return rows.map((r) => r.slug);
}
