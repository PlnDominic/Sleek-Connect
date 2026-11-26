import { NextResponse, type NextRequest } from 'next/server';
import { appleConfigured, revokeRefreshToken } from '@/lib/apple/revoke';
import { clientForBearer } from '@/lib/apple/session';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

/** Called by the app just before it deletes an account: ends the Apple ID's link with the app. 204 when there is nothing to revoke. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit({ key: `apple-revoke:${clientAddress(request)}`, limit: 10, windowMs: 15 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  if (!appleConfigured()) return new NextResponse(null, { status: 204 });
  const supabase = await clientForBearer(request);
  if (!supabase) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const { data: token } = await supabase.rpc('take_apple_refresh_token');
  if (!token) return new NextResponse(null, { status: 204 });
  if (await revokeRefreshToken(token)) return new NextResponse(null, { status: 204 });
  // Apple didn't confirm: keep the token so the shopper can try again, and don't let the account be deleted yet.
  await supabase.rpc('save_apple_refresh_token', { p_token: token });
  return NextResponse.json({ error: 'Apple could not be reached.' }, { status: 502 });
}
