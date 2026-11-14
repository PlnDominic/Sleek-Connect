export const siteName = 'Sleek Connect Store';

/** The public address of the store, for links in messages, the sitemap and search engines. */
export function siteUrl(): string {
  return normalizeSiteUrl(process.env.SITE_URL) ?? normalizeSiteUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? 'http://localhost:3000';
}

/**
 * An address typed into an environment variable, made safe to use: spaces and a trailing slash are dropped, and a
 * missing `https://` is added (`shop.example` is a common way to write it, and `new URL('shop.example')` throws and would
 * stop the site building). Null when there is nothing usable.
 */
export function normalizeSiteUrl(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `${/^(localhost|127\.0\.0\.1)(:|$)/.test(trimmed) ? 'http' : 'https'}://${trimmed}`;
  try {
    return new URL(withScheme).origin === withScheme || new URL(withScheme).pathname !== '/' ? withScheme : new URL(withScheme).origin;
  } catch {
    return null;
  }
}

/** The store's share picture (app/opengraph-image.tsx). Pages that set their own Open Graph data must name it again. */
export const defaultShareImage = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Sleek Connect Store: everyday essentials, delivered across Accra',
};
