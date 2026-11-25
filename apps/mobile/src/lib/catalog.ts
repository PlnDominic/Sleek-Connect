import {
  categoryFromRow,
  productFromRow,
  productSelect,
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

const photoBase = photoUrl('').replace(/\/$/, '');

export async function getCategories(): Promise<Category[]> {
  const rows = check(await supabase.from('categories').select('*').order('sort_order'));
  return (rows as CategoryRowLike[]).map((r) => categoryFromRow(r, photoBase));
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
  const [rows, metrics] = await Promise.all([
    supabase.from('products').select(productSelect).order('created_at', { ascending: false }),
    // Average rating, review count and sales rank; if this can't be read the shop still shows, just without ratings.
    supabase.rpc('get_product_discovery_metrics' as never),
  ]);
  const bySlug = new Map(((metrics.data ?? []) as { slug: string; average_rating: number; review_count: number; popularity: number }[]).map((m) => [m.slug, m]));
  return (check(rows) as unknown[]).map((row) => {
    const product = toProduct(row);
    const m = bySlug.get(product.slug);
    return m ? { ...product, rating: Number(m.average_rating), reviewCount: m.review_count, popularity: Number(m.popularity) } : product;
  });
}

export async function getProduct(slug: string): Promise<Product | null> {
  const data = check(await supabase.from('products').select(productSelect).eq('slug', slug).maybeSingle());
  return data ? toProduct(data) : null;
}

export async function getProductBatches(slug: string) {
  const rows = check(await supabase.rpc('product_current_batches', { p_slug: slug })) as { size_code: string; batch_code: string; expires_on: string | null }[] | null;
  return (rows ?? []).map((b) => ({ sizeId: b.size_code || undefined, batch: b.batch_code, expiresOn: b.expires_on ?? undefined }));
}

export async function getSizeGuide(slug: string) {
  const product = check(await supabase.from('products').select('size_guide_id').eq('slug', slug).maybeSingle()) as { size_guide_id: string | null } | null;
  if (!product?.size_guide_id) return null;
  const guide = check(await supabase.from('size_guides').select('title, intro, columns, rows').eq('id', product.size_guide_id).maybeSingle());
  return guide as { title: string; intro: string | null; columns: string[]; rows: string[][] } | null;
}

export async function getBagProducts(slugs: string[]): Promise<Product[]> {
  const pages: Promise<Product[]>[] = [];
  for (let i = 0; i < slugs.length; i += 50) {
    pages.push((async () => {
      const rows = check(await supabase.from('products').select(productSelect).in('slug', slugs.slice(i, i + 50)));
      return (rows as unknown[]).map(toProduct);
    })());
  }
  return (await Promise.all(pages)).flat();
}

/** Slugs matching a search, best first (typos and synonyms allowed: the same ranking as the website). */
export async function searchSlugs(query: string): Promise<string[]> {
  const rows = check(await supabase.rpc('search_products', { p_query: query, p_limit: 60 })) as { slug: string; score: number }[];
  return rows.map((r) => r.slug);
}

