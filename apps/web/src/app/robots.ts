import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/**
 * Crawlers may read the shop. The admin console, the API and the auth routes are kept out of search results by an `X-Robots-Tag: noindex`
 * header (next.config.ts), not listed here: robots.txt is public, and naming them would only tell people where they are.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/account', '/bag', '/checkout', '/orders/', '/saved', '/track', '/search'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
