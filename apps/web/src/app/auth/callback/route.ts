import { NextResponse, type NextRequest } from 'next/server';
import { createUserSupabase } from '@/lib/supabase/server';

/** Google sends the shopper back here; exchange the one-time code for a session cookie. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next') ?? '/account';
  // Only allow same-site paths, never "//evil.example".
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/account';

  if (code) {
    const supabase = await createUserSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (searchParams.get('consent') === '1') {
        await supabase.rpc('record_signup_consent');
      }
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  // A failed staff sign-in goes back to the staff sign-in screen, not the shopper's account page.
  const failed = next.startsWith('/admin') ? '/admin?error=signin' : '/account?error=signin';
  return NextResponse.redirect(new URL(failed, request.url));
}
