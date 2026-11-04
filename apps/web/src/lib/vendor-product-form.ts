import { text } from '@/lib/admin/action-state';
import type { Json } from '@/lib/supabase/database.types';

const lines = (value: string) => value.split('\n').map((l) => l.trim()).filter(Boolean);

/** Turns the product form into the object `vendor_save_product` expects. */
export function productFromForm(form: FormData, id: string | null): Json {
  const sizes: { code: string; label: string; price_ghs: string; is_default: boolean }[] = [];
  for (let i = 0; i < 4; i++) {
    const label = text(form, `size_label_${i}`);
    const price = text(form, `size_price_${i}`);
    if (!label && !price) continue;
    const code = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `size-${i + 1}`;
    sizes.push({ code, label, price_ghs: price, is_default: sizes.length === 0 });
  }
  return {
    id: id ?? '',
    name: text(form, 'name'),
    brand: text(form, 'brand'),
    department: text(form, 'department'),
    kind: text(form, 'kind'),
    kids_filter: text(form, 'kids_filter'),
    category_id: text(form, 'category_id'),
    price_ghs: text(form, 'price_ghs'),
    was_price_ghs: text(form, 'was_price_ghs'),
    sizes,
    age_bands: form.getAll('age_bands').map(String),
    summary: text(form, 'summary'),
    description: text(form, 'description'),
    highlights: lines(text(form, 'highlights')),
    recommended_age: text(form, 'recommended_age'),
    warnings: text(form, 'warnings'),
    how_to_use: text(form, 'how_to_use'),
    ingredients: text(form, 'ingredients'),
    country_of_origin: text(form, 'country_of_origin'),
    regulatory_reference: text(form, 'regulatory_reference'),
    period_after_opening: text(form, 'period_after_opening'),
    warning_label: text(form, 'warning_label'),
    returnable: form.get('returnable') === 'on',
    return_note: text(form, 'return_note'),
    publish: form.get('publish') === 'on',
  };
}
