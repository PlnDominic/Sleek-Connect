import { NextResponse, type NextRequest } from 'next/server';
import { getSuggestions } from '@/lib/search';

/** GET /api/search/suggest?q=… : completions for the search box. Public catalogue data only. */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 60);
  if (q.length < 2) return NextResponse.json({ suggestions: [] });
  try {
    const suggestions = await getSuggestions(q, 6);
    return NextResponse.json({ suggestions }, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } });
  } catch {
    // Suggestions are a convenience: the search box still works without them.
    return NextResponse.json({ suggestions: [] });
  }
}
