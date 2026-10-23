'use server';

import { updateTag } from 'next/cache';
import { createUserSupabase } from '@/lib/supabase/server';

export type ReviewResult = { ok: true } | { ok: false; message: string };

/**
 * Saves the signed-in shopper's review. Editing a published review takes it off the product page until staff check it
 * again, so the catalogue cache is refreshed.
 */
export async function submitReview(slug: string, rating: number, title: string, body: string): Promise<ReviewResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('submit_review', { p_slug: slug, p_rating: rating, p_title: title, p_body: body });
  if (error) {
    if (error.code === '22023' || error.code === '42501') return { ok: false, message: error.message };
    console.error('submit_review failed', error);
    return { ok: false, message: 'We couldn’t save your review. Please try again.' };
  }
  updateTag('catalog');
  return { ok: true };
}

export async function deleteReview(slug: string): Promise<ReviewResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('delete_my_review', { p_slug: slug });
  if (error) {
    console.error('delete_my_review failed', error);
    return { ok: false, message: 'We couldn’t delete your review. Please try again.' };
  }
  updateTag('catalog');
  return { ok: true };
}
