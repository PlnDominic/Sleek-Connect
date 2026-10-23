import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { createSupabase } from './supabase/server';

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  displayName: string;
  createdAt: string;
}

export interface ReviewSummary {
  count: number;
  average: number;
  /** How many reviews gave 1, 2, 3, 4 and 5 stars. */
  stars: [number, number, number, number, number];
}

/** Published reviews of a product and their summary, refreshed when staff moderate (the `catalog` tag). */
export async function getProductReviews(slug: string): Promise<{ summary: ReviewSummary; reviews: Review[] }> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const supabase = createSupabase();
  const [list, summary] = await Promise.all([
    supabase.rpc('get_product_reviews', { p_slug: slug, p_limit: 20 }),
    supabase.rpc('get_review_summary', { p_slug: slug }).single(),
  ]);
  if (list.error) throw new Error(`Reviews failed: ${list.error.message}`);
  if (summary.error) throw new Error(`Review summary failed: ${summary.error.message}`);
  const s = summary.data;
  return {
    summary: { count: s.review_count, average: Number(s.average), stars: [s.stars_1, s.stars_2, s.stars_3, s.stars_4, s.stars_5] },
    reviews: list.data.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      displayName: r.display_name,
      createdAt: r.created_at,
    })),
  };
}
