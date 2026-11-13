import { NextResponse, type NextRequest } from 'next/server';
import { createUserSupabase } from '@/lib/supabase/server';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger, requestId } from '@/lib/observability';
import { safeNextPath } from '@/lib/safe-redirect';

/** Google sends the shopper back here; exchange the one-time code for a session cookie. */
export async function GET(request: NextRequest) {
  const id = requestId(request);
  const limit = await rateLimit({ key: `auth-callback:${clientAddress(request)}`, limit: 20, windowMs: 15 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  // Only same-site paths: never "//evil.example" or "/\evil.example" (see safeNextPath).
  const next = safeNextPath(searchParams.get('next'));

  if (code) {
    const supabase = await createUserSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (searchParams.get('consent') === '1') {
        await supabase.rpc('record_signup_consent');
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
    logger.warn('auth_callback_failed', { requestId: id, destination: next.startsWith('/admin') ? 'admin' : 'account' });
  }

  // A failed staff sign-in goes back to the staff sign-in screen, not the shopper's account page.
  const failed = next.startsWith('/admin') ? '/admin?error=signin' : '/account?error=signin';
  return NextResponse.redirect(new URL(failed, request.url));
}
