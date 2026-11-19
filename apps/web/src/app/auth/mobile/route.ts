import { NextResponse, type NextRequest } from 'next/server';

/**
 * Hands a Google sign-in back to the mobile app. Supabase only returns to addresses on its allow list, and the website is already on it;
 * Expo Go's address (exp://<laptop ip>:8081/--/auth/callback) changes with the network. The app sends the shopper here with `to` set to
 * its own return address, and this passes the one-time `code` on. The code is useless without the app's PKCE verifier.
 */
const PRIVATE_HOST = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

function appAddress(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'sleekconnect:') return url;
    // Expo Go during development: only addresses on the developer's own network.
    if (url.protocol === 'exp:' && PRIVATE_HOST.test(url.hostname)) return url;
  } catch {
    // fall through
  }
  return null;
}

export function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const target = appAddress(searchParams.get('to'));
  if (!target) return new NextResponse('Not found', { status: 404 });
  for (const key of ['code', 'error', 'error_description']) {
    const value = searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }
  return NextResponse.redirect(target, 302);
}
