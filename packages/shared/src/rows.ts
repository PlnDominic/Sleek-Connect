/**
 * Turns Supabase rows into the shared `Product` and `Category` shapes. The web store and the mobile app read the same
 * tables, so they share this mapping instead of each keeping a copy.
 */
import {
  asImageKey,
  type AgeBandId,
  type Category,
  type Department,
  type KidsFilter,
  type Product,
  type ProductDetails,
  type ProductKind,
} from './catalog';

/** The columns to select for a product, with the tables it needs to be shown (sizes, age bands, stock, photos). */
export const productSelect =
  '*, product_sizes(code, label, price_ghs, is_default, sort_order), product_age_bands(age_band_id), inventory_levels(size_code, in_stock), product_images(path, alt, sort_order)';

/** A `products` row as `productSelect` returns it. */
export interface ProductRowLike {
  slug: string;
  name: string;
  brand: string | null;
  department: Department;
  category_id: string | null;
  kids_filter: KidsFilter | null;
  collection: string | null;
  price_ghs: number;
  was_price_ghs: number | null;
  badge: string | null;
  tag: string;
  summary: string;
  image_key: string | null;
  tint: string;
  kind: ProductKind;
  details: unknown;
  warning_label: string | null;
  returnable: boolean;
  return_note: string | null;
  skin_types: string[];
  shades: string[];
  created_at: string;
  ingredients: string | null;
  country_of_origin: string | null;
  regulatory_reference: string | null;
  period_after_opening: string | null;
  product_sizes: { code: string; label: string; price_ghs: number; is_default: boolean; sort_order: number }[];
  product_age_bands: { age_band_id: string }[];
  inventory_levels: { size_code: string; in_stock: boolean | null }[];
  product_images: { path: string; alt: string | null; sort_order: number }[];
}

/** `photoUrl` turns an uploaded photo's storage path into its public address. */
export function productFromRow(row: ProductRowLike, photoUrl: (path: string) => string): Product {
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

/** A `categories` row. */
export interface CategoryRowLike {
  id: string;
  name: string;
  department: Department;
  image_key: string | null;
  tint: string;
  kind: ProductKind;
}

export function categoryFromRow(row: CategoryRowLike): Category {
  return {
    id: row.id,
    name: row.name,
    department: row.department,
    image: asImageKey(row.image_key),
    tint: row.tint,
    kind: row.kind,
  };
}
