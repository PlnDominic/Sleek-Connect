import { NextResponse } from 'next/server';
import { createUserSupabase } from '@/lib/supabase/server';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger, requestId, withRequestId } from '@/lib/observability';

/** GET /account/privacy/export: everything the store holds about the signed-in shopper, as a JSON download (FR-057). */
export async function GET(request: Request) {
  const id = requestId(request);
  const limit = rateLimit({ key: `privacy-export:${clientAddress(request)}`, limit: 3, windowMs: 60 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);
  const supabase = await createUserSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return withRequestId(NextResponse.json({ error: 'Sign in to download your data.', requestId: id }, { status: 401 }), id);

  const { data, error } = await supabase.rpc('export_my_data');
  if (error) {
    logger.error('privacy_export_failed', error, { requestId: id });
    return withRequestId(NextResponse.json({ error: 'We couldn’t prepare your data. Please try again.', requestId: id }, { status: 500 }), id);
  }
  const day = new Date().toISOString().slice(0, 10);
  return withRequestId(new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="sleek-connect-store-data-${day}.json"`,
      'Cache-Control': 'private, no-store',
    },
  }), id);
}
