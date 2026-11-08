import { NextResponse, type NextRequest } from 'next/server';
import { createUserSupabase } from '@/lib/supabase/server';
import { clientAddress, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logger, requestId } from '@/lib/observability';
import { safeNextPath } from '@/lib/safe-redirect';
import { decodeSignInReturn, SIGN_IN_RETURN_COOKIE } from '@/lib/sign-in-return';

/** Google sends the shopper back here; exchange the one-time code for a session cookie. */
export async function GET(request: NextRequest) {
  const id = requestId(request);
  const limit = rateLimit({ key: `auth-callback:${clientAddress(request)}`, limit: 20, windowMs: 15 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit.retryAfter, id);
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  // Where to go and whether the shopper just agreed to the terms: from the cookie set before leaving for Google (the callback
  // address has to stay plain to match Supabase's redirect allow-list), or from the address for links made the old way.
  const remembered = decodeSignInReturn(request.cookies.get(SIGN_IN_RETURN_COOKIE)?.value);
  // Only same-site paths: never "//evil.example" or "/\evil.example" (see safeNextPath).
  const next = safeNextPath(searchParams.get('next') ?? remembered?.next);
  const consent = searchParams.get('consent') === '1' || remembered?.consent === true;
  // The cookie has done its job whichever way this ends.
  const redirect = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.delete(SIGN_IN_RETURN_COOKIE);
    return response;
  };

  if (code) {
    const supabase = await createUserSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (consent) {
        await supabase.rpc('record_signup_consent');
      }
      return redirect(next);
    }
    logger.warn('auth_callback_failed', { requestId: id, destination: next.startsWith('/admin') ? 'admin' : 'account' });
  }

  // A failed staff sign-in goes back to the staff sign-in screen, not the shopper's account page.
  return redirect(next.startsWith('/admin') ? '/admin?error=signin' : '/account?error=signin');
}
