import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { categoryFromRow, productFromRow, productSelect, type AgeBand, type AgeBandId, type Category, type Product } from '@sleek/shared';
import type { DeliveryConfig } from './delivery';
import { photoUrl, vendorAssetUrl } from './photos';
import { createSupabase } from './supabase/server';
import type { Database } from './supabase/database.types';

type Tables = Database['public']['Tables'];
type ProductRow = Tables['products']['Row'] & {
  product_sizes: Pick<Tables['product_sizes']['Row'], 'code' | 'label' | 'price_ghs' | 'is_default' | 'sort_order'>[];
  product_age_bands: Pick<Tables['product_age_bands']['Row'], 'age_band_id'>[];
  inventory_levels: { size_code: string; in_stock: boolean | null }[];
  product_images: Pick<Tables['product_images']['Row'], 'path' | 'alt' | 'sort_order'>[];
  vendors: Pick<Tables['vendors']['Row'], 'slug' | 'name' | 'is_house'> | null;
};

const productColumns = productSelect;

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data as T;
}

/**
 * Ratings and the stores page came with a later migration. Until it has been run on a database, those reads return
 * `fallback` instead of failing the whole page (or the build); any other error is still thrown.
 */
function orMissing<T>({ data, error }: { data: unknown; error: { code?: string; message: string } | null }, fallback: T): T {
  if (error && (error.code === 'PGRST202' || error.code === '42883')) return fallback;
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data as T;
}

function toProduct(row: ProductRow): Product {
  return productFromRow(row, photoUrl);
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

  const categories: Category[] = categoryRows.map(categoryFromRow);

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

  const supabase = createSupabase();
  const [row, batches] = await Promise.all([
    supabase.from('products').select(productColumns).eq('slug', slug).maybeSingle().then(unwrap),
    supabase.rpc('product_current_batches', { p_slug: slug }).then(unwrap),
  ]);
  if (!row) return null;
  return {
    ...toProduct(row as ProductRow),
    currentBatches: batches.map((b) => ({ sizeId: b.size_code || undefined, batch: b.batch_code, expiresOn: b.expires_on ?? undefined })),
  };
}

export async function getRelatedProducts(excludeSlug: string): Promise<Product[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const [curated, target, all] = await Promise.all([slotProducts('product_related'), getProduct(excludeSlug), allPublishedProducts()]);
  const selected = new Map<string, Product>();
  curated.filter((p) => p.slug !== excludeSlug).forEach((p) => selected.set(p.slug, p));
  if (target) {
    const score = (p: Product) =>
      (p.category === target.category ? 5 : 0) +
      (p.brand && target.brand && p.brand === target.brand ? 4 : 0) +
      (p.department === target.department ? 2 : 0) +
      (p.ageBands?.some((a) => target.ageBands?.includes(a)) ? 2 : 0) +
      (p.inStock === false ? -3 : 0) +
      (p.popularity ?? 0) / 1000;
    [...all].filter((p) => p.slug !== excludeSlug).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name)).forEach((p) => selected.set(p.slug, p));
  }
  return [...selected.values()].slice(0, 6);
}

export async function listProductSlugs(): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const rows = unwrap(await createSupabase().from('products').select('slug'));
  return rows.map((r) => r.slug);
}

/** Delivery areas, zones, fees, free-delivery threshold and estimates, as admins set them in Admin → Delivery. */
export async function getDeliveryConfig(): Promise<DeliveryConfig> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const supabase = createSupabase();
  const [areas, zones, rates, options, settings, cod] = await Promise.all([
    supabase.from('delivery_areas').select('name, zone_id').eq('is_active', true).order('sort_order').then(unwrap),
    supabase.from('delivery_zones').select('id, name').order('sort_order').then(unwrap),
    supabase.from('delivery_rates').select('zone_id, option_id, fee_ghs, is_available').then(unwrap),
    supabase
      .from('delivery_options')
      .select('id, label, fee_ghs, free_eligible, days_min, days_max, cutoff_time')
      .order('sort_order')
      .then(unwrap),
    supabase.from('store_settings').select('free_delivery_threshold_ghs').single().then(unwrap),
    // Read apart from the rest: checkout keeps working (without the option) on a database that doesn't have it yet.
    supabase.from('store_settings').select('pay_on_delivery_enabled, pay_on_delivery_max_ghs').single(),
  ]);
  return {
    areas: areas.map((a) => ({ name: a.name, zoneId: a.zone_id })),
    zones,
    rates: rates.map((r) => ({ zoneId: r.zone_id, optionId: r.option_id, fee: r.fee_ghs, available: r.is_available })),
    options: options.map((o) => ({
      id: o.id,
      label: o.label,
      fee: o.fee_ghs,
      freeEligible: o.free_eligible,
      daysMin: o.days_min,
      daysMax: o.days_max,
      cutoff: o.cutoff_time?.slice(0, 5) ?? null,
    })),
    freeThreshold: settings?.free_delivery_threshold_ghs ?? null,
    payOnDelivery: {
      enabled: cod.data?.pay_on_delivery_enabled ?? false,
      maxGhs: cod.data?.pay_on_delivery_max_ghs ?? null,
    },
  };
}

/** Every published product, by name. */
export async function allPublishedProducts(): Promise<Product[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const rows = unwrap(await createSupabase().from('products').select(productColumns).order('name'));
  return rows.map((r) => toProduct(r as ProductRow));
}

export async function getCategories(): Promise<Category[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const rows = unwrap(await createSupabase().from('categories').select('*').order('sort_order'));
  return rows.map(categoryFromRow);
}

export interface StoreInfo {
  returnWindowDays: number;
  reservationMinutes: number;
  freeDeliveryThreshold?: number;
  supportPhone?: string;
  supportWhatsapp?: string;
  supportEmail?: string;
  supportHours?: string;
}

/** The return window, payment hold and support contacts, as admins set them in the admin console. */
export async function getStoreInfo(): Promise<StoreInfo> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const { data: s, error } = await createSupabase()
    .from('store_settings')
    .select('return_window_days, reservation_minutes, free_delivery_threshold_ghs, support_phone, support_whatsapp, support_email, support_hours')
    .single();
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return {
    returnWindowDays: s.return_window_days,
    reservationMinutes: s.reservation_minutes,
    freeDeliveryThreshold: s.free_delivery_threshold_ghs ?? undefined,
    supportPhone: s.support_phone ?? undefined,
    supportWhatsapp: s.support_whatsapp ?? undefined,
    supportEmail: s.support_email ?? undefined,
    supportHours: s.support_hours ?? undefined,
  };
}

export async function getAgeBands(): Promise<AgeBand[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const rows = unwrap(await createSupabase().from('age_bands').select('id, label, stage').order('sort_order'));
  return rows.map((b) => ({ id: b.id as AgeBandId, label: b.label, stage: b.stage }));
}

/** Published products suitable for an age band, by name. */
export async function getAgeBandProducts(band: string): Promise<Product[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const rows = unwrap(
    await createSupabase()
      .from('products')
      .select(`${productColumns}, band:product_age_bands!inner(age_band_id)`)
      .eq('band.age_band_id', band)
      .order('name'),
  );
  return rows.map((r) => toProduct(r as unknown as ProductRow));
}

export interface Storefront {
  name: string;
  slug: string;
  tagline?: string;
  description?: string;
  logo?: string;
  banner?: string;
  isHouse: boolean;
  products: Product[];
  /** Average of the published reviews on this store's products (0 when there are none). */
  rating: { average: number; count: number };
  reviews: StoreReview[];
}

export interface StoreReview {
  rating: number;
  title: string | null;
  body: string | null;
  display_name: string | null;
  created_at: string;
  product_name: string;
  product_slug: string;
}

export interface StoreListing {
  slug: string;
  name: string;
  tagline?: string;
  logo?: string;
  banner?: string;
  productCount: number;
  rating: number;
  reviewCount: number;
}

/** A vendor's public store with the products on sale, or null when the store doesn't exist or isn't open. */
export async function getStorefront(slug: string): Promise<Storefront | null> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const supabase = createSupabase();
  // Row level security only returns stores that are approved and paid up.
  const { data: vendor, error } = await supabase
    .from('vendors')
    .select('id, slug, name, tagline, description, logo_path, banner_path, is_house')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  if (!vendor) return null;
  const [rows, rating, reviews] = await Promise.all([
    supabase.from('products').select(productColumns).eq('vendor_id', vendor.id).order('created_at', { ascending: false }).then(unwrap),
    supabase.rpc('store_rating', { p_slug: slug }).then((r) => orMissing(r, { average: 0, count: 0 })),
    supabase.rpc('store_reviews', { p_slug: slug, p_limit: 6 }).then((r) => orMissing<StoreReview[]>(r, [])),
  ]);
  const stats = rating as { average: number; count: number };
  return {
    name: vendor.name,
    slug: vendor.slug,
    tagline: vendor.tagline ?? undefined,
    description: vendor.description ?? undefined,
    logo: vendorAssetUrl(vendor.logo_path),
    banner: vendorAssetUrl(vendor.banner_path),
    isHouse: vendor.is_house,
    products: (rows as ProductRow[]).map(toProduct),
    rating: { average: Number(stats.average), count: stats.count },
    reviews,
  };
}

/** The open vendor stores that have something on sale, for the stores page. */
export async function getStoreDirectory(): Promise<StoreListing[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  const rows = orMissing<
    {
      slug: string;
      name: string;
      tagline: string | null;
      logo_path: string | null;
      banner_path: string | null;
      product_count: number;
      rating: number;
      review_count: number;
    }[]
  >(await createSupabase().rpc('store_directory'), []);
  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    tagline: r.tagline ?? undefined,
    logo: vendorAssetUrl(r.logo_path),
    banner: vendorAssetUrl(r.banner_path),
    productCount: r.product_count,
    rating: Number(r.rating),
    reviewCount: r.review_count,
  }));
}

/** Slugs of the open stores, ours included, for the sitemap and pre-built store pages. */
export async function getStoreSlugs(): Promise<string[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  const rows = unwrap(await createSupabase().from('vendors').select('slug'));
  return rows.map((r) => r.slug);
}

/** What a prospective vendor needs to know before applying. */
export async function getVendorTerms(): Promise<{ annualFee: number; graceDays: number }> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');
  const { data, error } = await createSupabase().from('store_settings').select('vendor_annual_fee_ghs, vendor_grace_days').single();
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return { annualFee: data.vendor_annual_fee_ghs, graceDays: data.vendor_grace_days };
}
