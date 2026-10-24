import 'server-only';
import { cacheLife, cacheTag } from 'next/cache';
import { createSupabase } from './supabase/server';

export interface Suggestion {
  kind: 'product' | 'brand' | 'category';
  label: string;
  href: string;
}

/** As-you-type completions: products, brands and categories matching what was typed, typos allowed. */
export async function getSuggestions(query: string, limit = 6, minScore = 0.45): Promise<Suggestion[]> {
  const { data, error } = await createSupabase().rpc('search_suggestions', { p_query: query, p_limit: limit, p_min_score: minScore });
  if (error) throw new Error(`Suggestions failed: ${error.message}`);
  return data.flatMap((r): Suggestion[] => {
    if (r.kind === 'product' && r.slug) return [{ kind: 'product', label: r.label, href: `/products/${r.slug}` }];
    if (r.kind === 'category' && r.slug && r.department) {
      return [{ kind: 'category', label: r.label, href: `/shop/${r.department}/${r.slug}` }];
    }
    if (r.kind === 'brand') return [{ kind: 'brand', label: r.label, href: `/shop?brand=${encodeURIComponent(r.label)}` }];
    return [];
  });
}

/** "Did you mean" for a search that found nothing: the closest names, never the query itself. */
export async function didYouMean(query: string): Promise<Suggestion[]> {
  'use cache';
  cacheLife('minutes');
  cacheTag('catalog');

  const typed = query.trim().toLowerCase();
  return (await getSuggestions(query, 4, 0.3)).filter((s) => s.label.toLowerCase() !== typed).slice(0, 3);
}
