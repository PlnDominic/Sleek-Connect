import { supabase } from './supabase';

export interface Review {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  displayName: string;
  createdAt: string;
}

export interface ReviewData {
  count: number;
  average: number;
  reviews: Review[];
}

/** Published reviews and the average rating for a product (the same functions the website uses). */
export async function getProductReviews(slug: string): Promise<ReviewData> {
  const [list, summary] = await Promise.all([
    supabase.rpc('get_product_reviews', { p_slug: slug, p_limit: 5 }),
    supabase.rpc('get_review_summary', { p_slug: slug }).single(),
  ]);
  const rows = (list.data ?? []) as { id: string; rating: number; title: string | null; body: string; display_name: string; created_at: string }[];
  const s = summary.data as { review_count: number; average: number } | null;
  return {
    count: s?.review_count ?? 0,
    average: Number(s?.average ?? 0),
    reviews: rows.map((r) => ({ id: r.id, rating: r.rating, title: r.title, body: r.body, displayName: r.display_name, createdAt: r.created_at })),
  };
}
