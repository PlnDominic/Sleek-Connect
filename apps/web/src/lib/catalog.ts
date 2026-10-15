import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import {
  imageFiles,
  type AgeBandId,
  type Category,
  type ImageKey,
  type Product,
  type ProductDetails,
} from '@sleek/shared';
import { createSupabase } from './supabase/server';
import type { Database } from './supabase/database.types';

type Tables = Database['public']['Tables'];
type ProductRow = Tables['products']['Row'] & {
  product_sizes: Pick<Tables['product_sizes']['Row'], 'code' | 'label' | 'price_ghs' | 'is_default' | 'sort_order'>[];
  product_age_bands: Pick<Tables['product_age_bands']['Row'], 'age_band_id'>[];
};

const productColumns =
  '*, product_sizes(code, label, price_ghs, is_default, sort_order), product_age_bands(age_band_id)';

export interface DeliveryOption {
  id: string;
  label: string;
  fee: number | null;
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data as T;
}

const toImageKey = (key: string | null): ImageKey | undefined =>
  key && key in imageFiles ? (key as ImageKey) : undefined;

function toProduct(row: ProductRow): Product {
  const sizes = [...row.product_sizes].sort((a, b) => a.sort_order - b.sort_order);
  return {
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? undefined,
    department: row.department,
    category: row.category_id ?? '',
    kidsFilter: row.kids_filter ?? undefined,
    collection: row.collection ?? undefined,
    price: row.price_ghs,
    was: row.was_price_ghs ?? undefined,
    badge: row.badge ?? undefined,
    tag: row.tag,
    summary: row.summary,
    image: toImageKey(row.image_key),
    tint: row.tint,
    kind: row.kind,
    sizes: sizes.length ? sizes.map((s) => ({ id: s.code, label: s.label, price: s.price_ghs })) : undefined,
    defaultSize: sizes.find((s) => s.is_default)?.code,
    ageBands: row.product_age_bands.map((b) => b.age_band_id as AgeBandId),
    details: (row.details as ProductDetails | null) ?? undefined,
  };
}

/** Products in a merchandising slot (e.g. `home_new_arrivals`), in position order. */
async function slotProducts(slot: string): Promise<Product[]> {
  const rows = unwrap(
    await createSupabase()
      .from('merchandising_slots')
      .select(`position, products(${productColumns})`)
      .eq('slot', slot)
      .order('position'),
  );
  return rows.flatMap((r) => (r.products ? [toProduct(r.products as ProductRow)] : []));
}

export async function getHomeCatalog() {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const [categoryRows, newArrivals, bestSellers] = await Promise.all([
    createSupabase().from('categories').select('*').order('sort_order').then(unwrap),
    slotProducts('home_new_arrivals'),
    slotProducts('home_best_sellers'),
  ]);

  const categories: Category[] = categoryRows.map((c) => ({
    id: c.id,
    name: c.name,
    department: c.department,
    image: toImageKey(c.image_key),
    tint: c.tint,
    kind: c.kind,
  }));

  return { categories, newArrivals, bestSellers };
}

export async function getProductsBySlugs(slugs: string[]): Promise<Product[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const rows = unwrap(await createSupabase().from('products').select(productColumns).in('slug', slugs));
  const bySlug = new Map(rows.map((r) => [r.slug, toProduct(r as ProductRow)]));
  return slugs.flatMap((slug) => bySlug.get(slug) ?? []);
}

export async function getProduct(slug: string): Promise<Product | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const row = unwrap(await createSupabase().from('products').select(productColumns).eq('slug', slug).maybeSingle());
  return row ? toProduct(row as ProductRow) : null;
}

export async function getRelatedProducts(excludeSlug: string): Promise<Product[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  return (await slotProducts('product_related')).filter((p) => p.slug !== excludeSlug);
}

export async function listProductSlugs(): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const rows = unwrap(await createSupabase().from('products').select('slug'));
  return rows.map((r) => r.slug);
}

export async function getCheckoutOptions(): Promise<{ areas: string[]; deliveryOptions: DeliveryOption[] }> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const supabase = createSupabase();
  const [areas, options] = await Promise.all([
    supabase.from('delivery_areas').select('name').order('sort_order').then(unwrap),
    supabase.from('delivery_options').select('id, label, fee_ghs').order('sort_order').then(unwrap),
  ]);
  return {
    areas: areas.map((a) => a.name),
    deliveryOptions: options.map((o) => ({ id: o.id, label: o.label, fee: o.fee_ghs })),
  };
}
