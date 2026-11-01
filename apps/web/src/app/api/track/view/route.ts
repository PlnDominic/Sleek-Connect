import { clientAddress, rateLimit } from '@/lib/rate-limit';
import { createSupabase } from '@/lib/supabase/server';

/**
 * Counts a view of a product page, for the sales reports vendors see (views and conversion). Only a number per product per day
 * is kept: no address, device or visitor. Visitors who send Do Not Track are not counted, and nobody can inflate it quickly
 * from one address.
 */
export async function POST(request: Request) {
  if (request.headers.get('dnt') === '1') return new Response(null, { status: 204 });
  const limit = rateLimit({ key: `product-view:${clientAddress(request)}`, limit: 120, windowMs: 10 * 60_000 });
  if (!limit.allowed) return new Response(null, { status: 204 });
  const body = (await request.json().catch(() => null)) as { slug?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return new Response(null, { status: 400 });
  // A failure (for example the migration not run yet) is not the visitor's problem.
  await createSupabase().rpc('record_product_view', { p_slug: slug });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}
