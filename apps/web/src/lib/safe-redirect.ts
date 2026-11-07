/**
 * Where to go after signing in: a same-site path or the fallback, never another site.
 *
 * Checking for a leading "/" and no "//" is not enough: browsers and the WHATWG URL parser treat "\" like "/", so "/\evil.example"
 * (and "/\t/evil.example", since tabs and newlines are stripped) resolve to https://evil.example. Anything with a backslash or a
 * control character is refused, and the result must still resolve to this site once parsed.
 */
export function safeNextPath(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return fallback;
  try {
    const base = 'https://site.invalid';
    const resolved = new URL(value, base);
    if (resolved.origin !== base) return fallback;
  } catch {
    return fallback;
  }
  return value;
}
