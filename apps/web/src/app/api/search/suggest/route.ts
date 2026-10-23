import { NextResponse, type NextRequest } from 'next/server';
import { getSuggestions } from '@/lib/search';
import { logger, requestId, withRequestId } from '@/lib/observability';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

/** GET /api/search/suggest?q=… : completions for the search box. Public catalogue data only. */
export async function GET(request: NextRequest) {
  const id = requestId(request);
  const limit = rateLimit({ key: `search-suggest:${clientAddress(request)}`, limit: 60, windowMs: 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return withRequestId(NextResponse.json({ suggestions: [] }), id);
  try {
    const suggestions = await getSuggestions(q, 6);
    return withRequestId(NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }), id);
  } catch {
    logger.warn('search_suggestions_failed', { requestId: id, queryLength: q.length });
    return withRequestId(NextResponse.json({ suggestions: [] }), id);
  }
}
