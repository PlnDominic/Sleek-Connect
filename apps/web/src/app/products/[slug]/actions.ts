'use server';

import { updateTag } from 'next/cache';
import { createUserSupabase } from '@/lib/supabase/server';

export type ReviewResult = { ok: true } | { ok: false; message: string };

export async function subscribeStockAlert(slug: string, email: string): Promise<ReviewResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('subscribe_stock_alert' as never, { p_slug: slug, p_email: email } as never);
  return error ? { ok: false, message: error.code === '22023' ? error.message : 'We couldn’t save your alert. Please try again.' } : { ok: true };
}

export async function askProductQuestion(slug: string, question: string): Promise<ReviewResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('submit_product_question' as never, { p_slug: slug, p_question: question } as never);
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function reportProductReview(reviewId: string, reason: string): Promise<ReviewResult> {
  const supabase = await createUserSupabase();
  const { error } = await supabase.rpc('report_product_review' as never, { p_review_id: reviewId, p_reason: reason } as never);
  return error ? { ok: false, message: error.message } : { ok: true };
}

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
