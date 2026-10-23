import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { asImageKey, type AgeBand, type AgeBandId, type Category, type Product, type ProductDetails } from '@sleek/shared';
import type { DeliveryConfig } from './delivery';
import { photoUrl } from './photos';
import { createSupabase } from './supabase/server';
import type { Database } from './supabase/database.types';

type Tables = Database['public']['Tables'];
type ProductRow = Tables['products']['Row'] & {
  product_sizes: Pick<Tables['product_sizes']['Row'], 'code' | 'label' | 'price_ghs' | 'is_default' | 'sort_order'>[];
  product_age_bands: Pick<Tables['product_age_bands']['Row'], 'age_band_id'>[];
  inventory_levels: { size_code: string; in_stock: boolean | null }[];
  product_images: Pick<Tables['product_images']['Row'], 'path' | 'alt' | 'sort_order'>[];
};

const productColumns =
  '*, product_sizes(code, label, price_ghs, is_default, sort_order), product_age_bands(age_band_id), inventory_levels(size_code, in_stock), product_images(path, alt, sort_order)';

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return data as T;
}

function toProduct(row: ProductRow): Product {
  const sizes = [...row.product_sizes].sort((a, b) => a.sort_order - b.sort_order);
  // A sellable unit with no stock row can't be bought (see place_order).
  const inStock = (code: string) => row.inventory_levels.some((i) => i.size_code === code && i.in_stock);
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
    image: asImageKey(row.image_key),
    photos: row.product_images.length
      ? [...row.product_images].sort((a, b) => a.sort_order - b.sort_order).map((i) => ({ url: photoUrl(i.path), alt: i.alt ?? undefined }))
      : undefined,
    tint: row.tint,
    kind: row.kind,
    sizes: sizes.length
      ? sizes.map((s) => ({ id: s.code, label: s.label, price: s.price_ghs, inStock: inStock(s.code) }))
      : undefined,
    defaultSize: sizes.find((s) => s.is_default)?.code,
    ageBands: row.product_age_bands.map((b) => b.age_band_id as AgeBandId),
    inStock: sizes.length ? sizes.some((s) => inStock(s.code)) : inStock(''),
    details: (row.details as ProductDetails | null) ?? undefined,
    warningLabel: row.warning_label ?? undefined,
    returnable: row.returnable,
    returnNote: row.return_note ?? undefined,
    skinTypes: row.skin_types.length ? row.skin_types : undefined,
    shades: row.shades.length ? row.shades : undefined,
    createdAt: row.created_at,
    compliance: {
      ingredients: row.ingredients ?? undefined,
      countryOfOrigin: row.country_of_origin ?? undefined,
      regulatoryReference: row.regulatory_reference ?? undefined,
      periodAfterOpening: row.period_after_opening ?? undefined,
    },
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
    image: asImageKey(c.image_key),
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
  const [areas, zones, rates, options, settings] = await Promise.all([
    supabase.from('delivery_areas').select('name, zone_id').eq('is_active', true).order('sort_order').then(unwrap),
    supabase.from('delivery_zones').select('id, name').order('sort_order').then(unwrap),
    supabase.from('delivery_rates').select('zone_id, option_id, fee_ghs, is_available').then(unwrap),
    supabase
      .from('delivery_options')
      .select('id, label, fee_ghs, free_eligible, days_min, days_max, cutoff_time')
      .order('sort_order')
      .then(unwrap),
    supabase.from('store_settings').select('free_delivery_threshold_ghs').single().then(unwrap),
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
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    department: c.department,
    image: asImageKey(c.image_key),
    tint: c.tint,
    kind: c.kind,
  }));
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
