import { clientAddress, rateLimit } from '@/lib/rate-limit';
import { createSupabase } from '@/lib/supabase/server';

/**
 * POST /api/search/miss { q }: a search that found nothing has stayed on screen. Keeps only the normalised words and a daily count
 * (see public.record_search_miss); nothing about who searched. Always answers 204 so it never gets in the shopper's way.
 */
export async function POST(request: Request) {
  const limit = await rateLimit({ key: `search-miss:${clientAddress(request)}`, limit: 30, windowMs: 10 * 60_000, shared: false });
  if (!limit.allowed) return new Response(null, { status: 204 });
  const body = (await request.json().catch(() => null)) as { q?: unknown } | null;
  const q = typeof body?.q === 'string' ? body.q.slice(0, 80) : '';
  if (q.length >= 2) await createSupabase().rpc('record_search_miss', { p_query: q });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
