'use server';

import { refresh, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
import type { Json } from '@/lib/supabase/database.types';
import { createUserSupabase } from '@/lib/supabase/server';

export async function applyForStore(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_apply', {
    p_name: text(form, 'name'),
    p_owner_name: text(form, 'owner_name'),
    p_email: text(form, 'email'),
    p_phone: text(form, 'phone'),
    p_id_type: text(form, 'id_type'),
    p_id_number: text(form, 'id_number'),
    p_id_path: text(form, 'id_path'),
    p_accept_terms: form.get('terms') === 'on',
  });
  if (error) return failed(error);
  refresh();
  return done('Application sent. We will review it and be in touch.');
}

export async function saveStore(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_update_store', {
    p: { name: text(form, 'name'), tagline: text(form, 'tagline'), description: text(form, 'description'), phone: text(form, 'phone') },
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Store details saved.');
}

/** Records a logo or banner the browser has just uploaded to Storage. */
export async function saveStoreImage(kind: 'logo' | 'banner', path: string | null): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_update_store', {
    p: kind === 'logo' ? { logo_path: path ?? '' } : { banner_path: path ?? '' },
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(path ? 'Image saved.' : 'Image removed.');
}

const lines = (value: string) => value.split('\n').map((l) => l.trim()).filter(Boolean);

/** Turns the product form into the object `vendor_save_product` expects. */
function productFromForm(form: FormData, id: string | null): Json {
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

export async function saveProduct(productId: string | null, _: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { data, error } = await supabase.rpc('vendor_save_product', { p: productFromForm(form, productId) });
  if (error) return failed(error);
  updateTag('catalog');
  const saved = data as unknown as { id: string; problems: string[] };
  if (!productId) redirect(`/vendor/products/${saved.id}?created=1`);
  refresh();
  return done(
    saved.problems.length
      ? `Saved. Before it can go on sale it still needs: ${saved.problems.join(', ')}.`
      : 'Saved. If you changed what the product is, we will look at it again before it goes back on sale.',
  );
}

export async function setStock(productId: string, sizeCode: string, _: ActionState, form: FormData): Promise<ActionState> {
  const quantity = Number(text(form, 'quantity'));
  if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, message: 'Enter a whole number, 0 or more.' };
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_set_stock', { p_product_id: productId, p_size_code: sizeCode, p_quantity: quantity });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Stock saved.');
}

export async function deleteProduct(productId: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_delete_product', { p_product_id: productId });
  if (error) return failed(error);
  updateTag('catalog');
  redirect('/vendor');
}

export type PhotoResult = { ok: boolean; message: string };

/** Records a photo the browser has just uploaded to Storage. */
export async function addProductPhoto(productId: string, path: string): Promise<PhotoResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('vendor_add_product_image', { p_product_id: productId, p_path: path });
  if (error) return { ok: false, message: error.code === '22023' || error.code === '42501' ? error.message : 'The photo couldn’t be saved.' };
  updateTag('catalog');
  refresh();
  return { ok: true, message: 'Photo added.' };
}

export async function removeProductPhoto(photoId: string): Promise<PhotoResult> {
  const supabase = await createUserSupabase();
  const { data: path, error } = await supabase.rpc('vendor_remove_product_image', { p_image_id: photoId });
  if (error) return { ok: false, message: error.code === '22023' || error.code === '42501' ? error.message : 'The photo couldn’t be removed.' };
  const { error: storageError } = await supabase.storage.from('product-images').remove([path]);
  if (storageError) console.error('Removing the photo file failed', storageError);
  updateTag('catalog');
  refresh();
  return { ok: true, message: 'Photo removed.' };
}
