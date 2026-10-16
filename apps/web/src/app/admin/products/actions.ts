'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import { flash } from '@/lib/admin/flash';
import { rowPayload, type ImportRow } from '@/lib/admin/product-import';
import { productRowColumns, rowToPayload, type ProductPayload, type ProductRow } from '@/lib/admin/product-payload';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

const lines = (v: string) => v.split('\n').map((s) => s.trim()).filter(Boolean);

function payloadFromForm(form: FormData): ProductPayload {
  let sizes: ProductPayload['sizes'] = [];
  try {
    sizes = JSON.parse(text(form, 'sizes_json') || '[]');
  } catch {
    sizes = [];
  }
  return {
    id: text(form, 'id') || undefined,
    slug: text(form, 'slug'),
    name: text(form, 'name'),
    brand: text(form, 'brand'),
    department: text(form, 'department'),
    category_id: text(form, 'category_id'),
    kids_filter: text(form, 'kids_filter'),
    kind: text(form, 'kind'),
    price_ghs: text(form, 'price_ghs'),
    was_price_ghs: text(form, 'was_price_ghs') || null,
    badge: text(form, 'badge'),
    tag: text(form, 'tag'),
    summary: text(form, 'summary'),
    image_key: text(form, 'image_key'),
    description: text(form, 'description'),
    highlights: lines(text(form, 'highlights')),
    free_from: lines(text(form, 'free_from')),
    recommended_age: text(form, 'recommended_age'),
    warnings: text(form, 'warnings'),
    how_to_use: text(form, 'how_to_use'),
    ingredients: text(form, 'ingredients'),
    country_of_origin: text(form, 'country_of_origin'),
    regulatory_reference: text(form, 'regulatory_reference'),
    period_after_opening: text(form, 'period_after_opening'),
    sizes: sizes.filter((s) => s.code || s.label || s.price_ghs !== ''),
    age_bands: form.getAll('age_bands').map(String),
    publish: form.get('publish') === 'on',
  };
}

interface SaveResult {
  id: string;
  slug: string;
  published: boolean;
  problems: string[];
}

export async function saveProduct(_: ActionState, form: FormData): Promise<ActionState> {
  const payload = payloadFromForm(form);
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_save_product', { p: payload as unknown as Json });
  if (error) return failed(error);
  const result = data as unknown as SaveResult;
  updateTag('catalog');
  const what = payload.id ? 'Saved' : 'Product created';
  flash(
    `/admin/products/${result.id}`,
    result.published
      ? `${what}. It’s live on the store.`
      : payload.publish
        ? `${what} as a draft. To publish it, add: ${result.problems.join(', ')}.`
        : `${what} as a draft (not on the store).`,
  );
}

export async function setPublished(productId: string, publish: boolean, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('admin_set_product_published', { p_product_id: productId, p_published: publish });
  if (error) return failed(error);
  if (data.length) return { ok: false, message: `Can’t publish yet. Add: ${data.join(', ')}.` };
  updateTag('catalog');
  refresh();
  return done(publish ? 'Published.' : 'Taken off the store.');
}

export async function recallProduct(productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_recall_product', { p_product_id: productId, p_reason: text(form, 'reason') });
  if (error) return failed(error);
  updateTag('catalog');
  flash(`/admin/products/${productId}`, 'Recalled: removed from the store, all its stock taken off sale, and open orders flagged for review.');
}

export async function liftRecall(productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_lift_recall', { p_product_id: productId });
  if (error) return failed(error);
  flash(`/admin/products/${productId}`, 'Recall lifted. Publish the product again when it’s ready; recalled batches stay off sale.');
}

export interface ImportResult {
  line: number;
  name: string;
  outcome: 'published' | 'draft' | 'error';
  message: string;
}

/** Saves imported rows one by one, so one bad row doesn't stop the rest (PRD FR-100: row-level errors). */
export async function importProducts(rows: ImportRow[]): Promise<ImportResult[]> {
  const supabase = await createUserSupabase();
  const slugs = rows.map((r) => r.values.slug).filter((s): s is string => Boolean(s));
  const { data: existing, error } = slugs.length
    ? await supabase.from('products').select(productRowColumns).in('slug', slugs)
    : { data: [], error: null };
  if (error) throw error;
  const bySlug = new Map((existing as unknown as ProductRow[]).map((p) => [p.slug, rowToPayload(p)]));

  const results: ImportResult[] = [];
  for (const row of rows) {
    const name = row.values.name ?? row.values.slug ?? '';
    if (row.errors.length) {
      results.push({ line: row.line, name, outcome: 'error', message: row.errors.join('; ') });
      continue;
    }
    const payload = rowPayload(row.values, row.values.slug ? bySlug.get(row.values.slug) : undefined);
    const { data, error: saveError } = await supabase.rpc('admin_save_product', { p: payload as unknown as Json });
    if (saveError) {
      results.push({ line: row.line, name, outcome: 'error', message: saveError.message });
      continue;
    }
    const result = data as unknown as SaveResult;
    results.push({
      line: row.line,
      name,
      outcome: result.published ? 'published' : 'draft',
      message: result.published
        ? 'Saved and published'
        : payload.publish
          ? `Saved as a draft. Missing: ${result.problems.join(', ')}`
          : 'Saved as a draft',
    });
  }
  updateTag('catalog');
  return results;
}
