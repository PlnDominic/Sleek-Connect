/** The product shape `admin_save_product` accepts, shared by the product form and the CSV import. */
export interface SizePayload {
  code: string;
  label: string;
  price_ghs: number | string;
  is_default?: boolean;
}

export interface ProductPayload {
  id?: string;
  slug?: string;
  name: string;
  brand?: string;
  department: string;
  category_id?: string;
  kids_filter?: string;
  kind: string;
  price_ghs: number | string;
  was_price_ghs?: number | string | null;
  badge?: string;
  tag?: string;
  summary?: string;
  image_key?: string;
  tint?: string;
  description?: string;
  highlights?: string[];
  free_from?: string[];
  recommended_age?: string;
  warnings?: string;
  how_to_use?: string;
  ingredients?: string;
  country_of_origin?: string;
  regulatory_reference?: string;
  period_after_opening?: string;
  sizes: SizePayload[];
  age_bands: string[];
  publish: boolean;
}

export const productKinds = ['bottle', 'jar', 'tube', 'garment', 'toy', 'gift'] as const;
export const kidsFilters = ['bath', 'toys', 'clothing', 'gifts'] as const;

/** A product row as staff read it, with its sizes and age bands. */
export interface ProductRow {
  id: string;
  slug: string;
  name: string;
  brand: string | null;
  department: string;
  category_id: string | null;
  kids_filter: string | null;
  kind: string;
  price_ghs: number;
  was_price_ghs: number | null;
  badge: string | null;
  tag: string;
  summary: string;
  image_key: string | null;
  tint: string;
  details: unknown;
  ingredients: string | null;
  country_of_origin: string | null;
  regulatory_reference: string | null;
  period_after_opening: string | null;
  is_published: boolean;
  product_sizes: { code: string; label: string; price_ghs: number; is_default: boolean; sort_order: number }[];
  product_age_bands: { age_band_id: string }[];
}

export const productRowColumns =
  'id, slug, name, brand, department, category_id, kids_filter, kind, price_ghs, was_price_ghs, badge, tag, summary, image_key, tint, details, ingredients, country_of_origin, regulatory_reference, period_after_opening, is_published, recalled_at, recall_reason, product_sizes(code, label, price_ghs, is_default, sort_order), product_age_bands(age_band_id)';

export function rowToPayload(row: ProductRow): ProductPayload {
  const d = (row.details ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brand: row.brand ?? undefined,
    department: row.department,
    category_id: row.category_id ?? undefined,
    kids_filter: row.kids_filter ?? undefined,
    kind: row.kind,
    price_ghs: row.price_ghs,
    was_price_ghs: row.was_price_ghs,
    badge: row.badge ?? undefined,
    tag: row.tag,
    summary: row.summary,
    image_key: row.image_key ?? undefined,
    tint: row.tint,
    description: str(d.description),
    highlights: list(d.highlights),
    free_from: list(d.freeFrom),
    recommended_age: str(d.recommendedAge),
    warnings: str(d.warnings),
    how_to_use: str(d.howToUse),
    ingredients: row.ingredients ?? undefined,
    country_of_origin: row.country_of_origin ?? undefined,
    regulatory_reference: row.regulatory_reference ?? undefined,
    period_after_opening: row.period_after_opening ?? undefined,
    sizes: [...row.product_sizes]
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({ code: s.code, label: s.label, price_ghs: s.price_ghs, is_default: s.is_default })),
    age_bands: row.product_age_bands.map((b) => b.age_band_id),
    publish: row.is_published,
  };
}

/** Which form field each publishing problem from the database points at. */
export const problemFields: Record<string, string> = {
  brand: 'brand',
  category: 'category_id',
  description: 'description',
  ingredients: 'ingredients',
  materials: 'ingredients',
  'safety notes': 'warnings',
  'country of origin': 'country_of_origin',
  'FDA registration number': 'regulatory_reference',
  'age range': 'recommended_age',
};
