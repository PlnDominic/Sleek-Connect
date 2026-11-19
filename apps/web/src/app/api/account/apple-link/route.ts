import { NextResponse, type NextRequest } from 'next/server';
import { exchangeAuthorizationCode, appleConfigured } from '@/lib/apple/revoke';
import { clientForBearer } from '@/lib/apple/session';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';

/** The iPhone app sends the Sign in with Apple authorization code here right after sign-in, so the link can be revoked if the account is deleted. */
export async function POST(request: NextRequest) {
  const limit = await rateLimit({ key: `apple-link:${clientAddress(request)}`, limit: 20, windowMs: 15 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter);
  if (!appleConfigured()) return new NextResponse(null, { status: 204 });
  const supabase = await clientForBearer(request);
  if (!supabase) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { authorizationCode?: unknown } | null;
  const code = typeof body?.authorizationCode === 'string' ? body.authorizationCode : '';
  if (!code || code.length > 2000) return NextResponse.json({ error: 'Missing code.' }, { status: 400 });
  const token = await exchangeAuthorizationCode(code);
  if (token) await supabase.rpc('save_apple_refresh_token', { p_token: token });
  return new NextResponse(null, { status: 204 });
}
