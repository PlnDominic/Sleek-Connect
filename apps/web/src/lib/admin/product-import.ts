import { departmentIds, isDepartment } from '@sleek/shared';
import type { ProductPayload, SizePayload } from './product-payload';
import { kidsFilters, productKinds } from './product-payload';

/** Columns of the bulk import template, in order. Lists use ";" between values. */
export const importColumns = [
  'slug', 'name', 'brand', 'department', 'category', 'kids_filter', 'kind', 'price', 'was_price', 'tag', 'summary',
  'description', 'highlights', 'free_from', 'recommended_age', 'warnings', 'how_to_use', 'ingredients',
  'country_of_origin', 'regulatory_reference', 'period_after_opening', 'skin_types', 'shades', 'warning_label',
  'returnable', 'return_note', 'age_bands', 'sizes', 'publish',
] as const;

export type ImportColumn = (typeof importColumns)[number];

export interface ImportRow {
  line: number;
  values: Partial<Record<ImportColumn, string>>;
  errors: string[];
}

const list = (v: string | undefined) => (v ?? '').split(';').map((s) => s.trim()).filter(Boolean);

/** "200:200 ml:50;*400:400 ml:85" → sizes. A leading * marks the default size. */
export function parseSizes(v: string | undefined): SizePayload[] {
  return list(v).map((part) => {
    const isDefault = part.startsWith('*');
    const [code = '', label = '', price = ''] = part.replace(/^\*/, '').split(':').map((s) => s.trim());
    return { code, label, price_ghs: price, is_default: isDefault };
  });
}

/** Reads the CSV grid into rows and checks what can be checked before touching the database. */
export function readImport(grid: string[][]): { rows: ImportRow[]; error?: string } {
  const [header, ...body] = grid;
  if (!header) return { rows: [], error: 'The file is empty.' };
  const names = header.map((h) => h.trim().toLowerCase());
  const missing = (['name', 'department', 'kind'] as const).filter((c) => !names.includes(c));
  if (missing.length) return { rows: [], error: `Missing columns: ${missing.join(', ')}. Use the template.` };
  const unknown = names.filter((n) => n && !(importColumns as readonly string[]).includes(n));
  if (unknown.length) return { rows: [], error: `Unknown columns: ${unknown.join(', ')}. Use the template.` };

  const rows = body.map((cells, i): ImportRow => {
    const values: ImportRow['values'] = {};
    names.forEach((n, j) => {
      const v = (cells[j] ?? '').trim();
      if (v) values[n as ImportColumn] = v;
    });
    const errors: string[] = [];
    if (!values.name) errors.push('name is required');
    if (!isDepartment(values.department)) errors.push(`department must be one of ${departmentIds.join(', ')}`);
    if (!values.kind || !(productKinds as readonly string[]).includes(values.kind)) {
      errors.push(`kind must be one of ${productKinds.join(', ')}`);
    }
    if (values.kids_filter && !(kidsFilters as readonly string[]).includes(values.kids_filter)) {
      errors.push(`kids_filter must be one of ${kidsFilters.join(', ')}`);
    }
    const sizes = parseSizes(values.sizes);
    if (!sizes.length && values.price !== undefined && Number.isNaN(Number(values.price))) errors.push('price must be a number');
    if (sizes.some((s) => !s.code || !s.label || Number.isNaN(Number(s.price_ghs)))) {
      errors.push('sizes must look like code:label:price, e.g. 200:200 ml:50');
    }
    if (values.was_price && Number.isNaN(Number(values.was_price))) errors.push('was_price must be a number');
    if (values.publish && !/^(yes|no|true|false|y|n)$/i.test(values.publish)) errors.push('publish must be yes or no');
    if (values.returnable && !/^(yes|no|true|false|y|n)$/i.test(values.returnable)) errors.push('returnable must be yes or no');
    return { line: i + 2, values, errors };
  });
  return { rows };
}

/** Builds the save payload. Empty cells keep the current value of an existing product. */
export function rowPayload(v: ImportRow['values'], existing?: ProductPayload): ProductPayload {
  const pick = (key: ImportColumn, current?: string) => v[key] ?? current;
  const sizes = parseSizes(v.sizes);
  return {
    ...existing,
    id: existing?.id,
    slug: pick('slug', existing?.slug),
    name: v.name ?? existing?.name ?? '',
    brand: pick('brand', existing?.brand),
    department: v.department ?? existing?.department ?? '',
    category_id: pick('category', existing?.category_id),
    kids_filter: pick('kids_filter', existing?.kids_filter),
    kind: v.kind ?? existing?.kind ?? '',
    price_ghs: v.price ?? existing?.price_ghs ?? '',
    was_price_ghs: v.was_price ?? existing?.was_price_ghs ?? null,
    tag: pick('tag', existing?.tag),
    summary: pick('summary', existing?.summary),
    description: pick('description', existing?.description),
    highlights: v.highlights ? list(v.highlights) : existing?.highlights,
    free_from: v.free_from ? list(v.free_from) : existing?.free_from,
    recommended_age: pick('recommended_age', existing?.recommended_age),
    warnings: pick('warnings', existing?.warnings),
    how_to_use: pick('how_to_use', existing?.how_to_use),
    ingredients: pick('ingredients', existing?.ingredients),
    country_of_origin: pick('country_of_origin', existing?.country_of_origin),
    regulatory_reference: pick('regulatory_reference', existing?.regulatory_reference),
    period_after_opening: pick('period_after_opening', existing?.period_after_opening),
    skin_types: v.skin_types ? list(v.skin_types) : existing?.skin_types,
    shades: v.shades ? list(v.shades) : existing?.shades,
    warning_label: pick('warning_label', existing?.warning_label),
    returnable: v.returnable ? /^(yes|true|y)$/i.test(v.returnable) : (existing?.returnable ?? true),
    return_note: pick('return_note', existing?.return_note),
    age_bands: v.age_bands ? list(v.age_bands) : (existing?.age_bands ?? []),
    sizes: sizes.length ? sizes : (existing?.sizes ?? []),
    publish: v.publish ? /^(yes|true|y)$/i.test(v.publish) : (existing?.publish ?? false),
  };
}
