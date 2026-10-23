export const siteName = 'Sleek Connect Store';

/** The public address of the store, for links in messages, the sitemap and search engines. */
export function siteUrl(): string {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return 'http://localhost:3000';
}

/** The store's share picture (app/opengraph-image.tsx). Pages that set their own Open Graph data must name it again. */
export const defaultShareImage = {
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Sleek Connect Store: authentic beauty and kids essentials in Accra',
};
