import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site';

/** Crawlers may read the shop; private pages (also marked noindex in next.config.ts) and the admin console are off limits. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/auth/', '/account', '/bag', '/checkout', '/orders/', '/saved', '/track', '/search'],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
