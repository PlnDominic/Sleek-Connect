import { safeNextPath } from './safe-redirect';

/**
 * Where to send someone after Google sign-in, and whether they just agreed to the shopper terms.
 *
 * It travels in a short-lived cookie, not in the callback address. Supabase only redirects to addresses on its allow-list, and
 * "https://shop/auth/callback?next=/admin" does not match an entry for "https://shop/auth/callback". When it doesn't match,
 * Supabase quietly sends the person to the Site URL instead, which is the home page. With the cookie, the address is always
 * the plain "/auth/callback".
 */
export const SIGN_IN_RETURN_COOKIE = 'sleek_sign_in_return';
export const SIGN_IN_RETURN_SECONDS = 10 * 60;

export interface SignInReturn {
  next: string;
  consent: boolean;
}

/** The cookie's value: "1" or "0" for consent, then the path (for example "0/admin"). */
export function encodeSignInReturn({ next, consent }: SignInReturn): string {
  return `${consent ? '1' : '0'}${safeNextPath(next)}`;
}

/** Reads the cookie's value back (it may or may not still be percent-encoded). Null when it is missing or not ours. */
export function decodeSignInReturn(raw: string | null | undefined): SignInReturn | null {
  if (!raw) return null;
  const read = (value: string): SignInReturn | null => {
    const match = /^([01])(\/.*)$/.exec(value);
    if (!match) return null;
    const next = safeNextPath(match[2], '');
    return next ? { next, consent: match[1] === '1' } : null;
  };
  const direct = read(raw);
  if (direct) return direct;
  try {
    return read(decodeURIComponent(raw));
  } catch {
    return null;
  }
}

/** Browser only: remembers where to go before the shopper or staff member leaves for Google. */
export function rememberSignInReturn(value: SignInReturn) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${SIGN_IN_RETURN_COOKIE}=${encodeURIComponent(encodeSignInReturn(value))}; Path=/; Max-Age=${SIGN_IN_RETURN_SECONDS}; SameSite=Lax${secure}`;
}
