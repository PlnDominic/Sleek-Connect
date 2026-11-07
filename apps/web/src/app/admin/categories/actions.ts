'use server';

import { refresh, updateTag } from 'next/cache';
import { done, failed, text, type ActionState } from '@/lib/admin/action-state';
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

/** Adds a category, or renames / re-files one (with an `id` field). */
export async function saveCategory(_: ActionState, form: FormData): Promise<ActionState> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_save_category', {
    p: { id: text(form, 'id') || null, name: text(form, 'name'), department: text(form, 'department') },
  });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done(text(form, 'id') ? 'Category saved.' : 'Category added. Upload its photo below.');
}

export async function moveCategory(id: string, direction: -1 | 1, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('admin_move_category', { p_id: id, p_direction: direction });
  if (error) return failed(error);
  updateTag('catalog');
  refresh();
  return done('Order saved.');
}

export async function deleteCategory(id: string, _: ActionState, form: FormData): Promise<ActionState> {
  void form;
  const supabase = await createUserSupabase();
  const { data: photo, error } = await supabase.rpc('admin_delete_category', { p_id: id });
  if (error) return failed(error);
  if (photo) await supabase.storage.from('product-images').remove([photo]);
  updateTag('catalog');
  refresh();
  return done('Category deleted.');
}
