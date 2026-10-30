import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { createSupabase } from './supabase/server';
export interface Review { id: string; rating: number; title: string | null; body: string; displayName: string; createdAt: string; }
export interface ReviewSummary { count: number; average: number; stars: [number, number, number, number, number]; }
export interface ProductQuestion { id: string; question: string; answer: string | null; createdAt: string; }
export async function getProductQuestions(slug: string): Promise<ProductQuestion[]> {
  'use cache'; cacheLife('minutes'); cacheTag('catalog');
  const { data, error } = await createSupabase().rpc('get_product_questions' as never, { p_slug: slug, p_limit: 20, p_offset: 0 } as never);
  if (error) return [];
  return ((data ?? []) as unknown as { id: string; question: string; answer: string | null; created_at: string }[]).map((q) => ({ id: q.id, question: q.question, answer: q.answer, createdAt: q.created_at }));
}
export async function getProductReviews(slug: string, page = 1, minRating = 0): Promise<{ summary: ReviewSummary; reviews: Review[] }> {
  'use cache'; cacheLife('minutes'); cacheTag('catalog');
  const supabase = createSupabase();
  const [pagedList, summary] = await Promise.all([
    supabase.rpc('get_product_reviews_page' as never, { p_slug: slug, p_limit: 10, p_offset: Math.max(0, page - 1) * 10, p_min_rating: minRating } as never),
    supabase.rpc('get_review_summary', { p_slug: slug }).single(),
  ]);
  const fallback = pagedList.error && page === 1 && minRating === 0 ? await supabase.rpc('get_product_reviews', { p_slug: slug, p_limit: 20 }) : null;
  const listData = (pagedList.error ? fallback?.data ?? [] : pagedList.data ?? []) as unknown as { id: string; rating: number; title: string | null; body: string; display_name: string; created_at: string }[];
  if (pagedList.error && !fallback) return { summary: { count: 0, average: 0, stars: [0, 0, 0, 0, 0] }, reviews: [] };
  if (summary.error) return { summary: { count: 0, average: 0, stars: [0, 0, 0, 0, 0] }, reviews: listData.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, displayName: r.display_name, createdAt: r.created_at })) };
  const s = summary.data;
  return { summary: { count: s.review_count, average: Number(s.average), stars: [s.stars_1, s.stars_2, s.stars_3, s.stars_4, s.stars_5] }, reviews: listData.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, displayName: r.display_name, createdAt: r.created_at })) };
}
