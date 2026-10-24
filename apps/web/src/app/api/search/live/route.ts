import { NextResponse, type NextRequest } from 'next/server';
import { getListingData, searchProducts } from '@/lib/listing';
import { logger, requestId, withRequestId } from '@/lib/observability';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { getSuggestions } from '@/lib/search';

/** One product in the live search dropdown. */
export interface LiveProduct {
  slug: string;
  name: string;
  brand?: string;
  category?: string;
  price: number;
  was?: number;
  photo?: string;
  image?: string;
  tint: string;
  kind: string;
  inStock?: boolean;
}

/** GET /api/search/live?q=… : the best matches as the shopper types. Public catalogue data only. */
export async function GET(request: NextRequest) {
  const id = requestId(request);
  const limit = rateLimit({ key: `search-live:${clientAddress(request)}`, limit: 180, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return withRequestId(NextResponse.json({ products: [], total: 0, suggestions: [] }), id);
  try {
    const [slugs, suggestions, { products, categories }] = await Promise.all([
      searchProducts(q),
      // Brands and categories are a bonus: if that lookup fails the product results still show.
      getSuggestions(q, 6).catch(() => []),
      getListingData(),
    ]);
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const found = slugs.flatMap((slug) => (bySlug.has(slug) ? [bySlug.get(slug)!] : []));
    const top: LiveProduct[] = found.slice(0, 6).map((p) => ({
      slug: p.slug,
      name: p.name,
      brand: p.brand,
      category: categoryName.get(p.category),
      price: p.price,
      was: p.was,
      photo: p.photos?.[0]?.url,
      image: p.image,
      tint: p.tint,
      kind: p.kind,
      inStock: p.inStock,
    }));
    return withRequestId(
      NextResponse.json(
        // Products come from the ranked search; the extra rows are only the brands and categories that match.
        { products: top, total: found.length, suggestions: suggestions.filter((s) => s.kind !== 'product').slice(0, 4) },
        { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } },
      ),
      id,
    );
  } catch {
    logger.warn('search_live_failed', { requestId: id, queryLength: q.length });
    return withRequestId(NextResponse.json({ products: [], total: 0, suggestions: [] }), id);
  }
}
