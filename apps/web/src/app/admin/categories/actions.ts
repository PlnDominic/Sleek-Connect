'use server';

import { refresh, updateTag } from 'next/cache';
import { createUserSupabase } from '@/lib/supabase/server';

export type CategoryPhotoResult = { ok: boolean; message: string };

const fail = (error: { code?: string; message: string }): CategoryPhotoResult =>
  error.code === '22023' || error.code === '42501'
    ? { ok: false, message: error.message }
    : (console.error(error), { ok: false, message: 'That didn’t work. Please try again.' });

/** Records a photo the browser has just uploaded, and removes the file it replaces. */
export async function setCategoryPhoto(id: string, path: string, previous: string | null): Promise<CategoryPhotoResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_category_photo', { p_id: id, p_path: path });
  if (error) {
    await supabase.storage.from('product-images').remove([path]);
    return fail(error);
  }
  if (previous && previous !== path) await supabase.storage.from('product-images').remove([previous]);
  updateTag('catalog');
  refresh();
  return { ok: true, message: 'Photo saved.' };
}

export async function clearCategoryPhoto(id: string, previous: string | null): Promise<CategoryPhotoResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_set_category_photo', { p_id: id });
  if (error) return fail(error);
  if (previous) await supabase.storage.from('product-images').remove([previous]);
  updateTag('catalog');
  refresh();
  return { ok: true, message: 'Photo removed.' };
}
