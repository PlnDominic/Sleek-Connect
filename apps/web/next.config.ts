import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';

// Product photos live in the public product-images bucket of the Supabase project.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
const localSupabase = supabase !== null && ['127.0.0.1', 'localhost'].includes(supabase.hostname);
const supabaseOrigin = supabase?.origin ?? '';
// Sentry's browser SDK posts to the host in its DSN (https://<key>@<host>/<project>); that is the one extra place the
// browser may connect to. PostHog goes through this site (the /ingest rewrite below), so it needs nothing here.
const sentryOrigin = (() => {
  try {
    return process.env.NEXT_PUBLIC_SENTRY_DSN ? `https://${new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).host}` : '';
  } catch {
    return '';
  }
})();
const posthogRegion = process.env.NEXT_PUBLIC_POSTHOG_REGION === 'eu' ? 'eu' : 'us';
// Google Tag Manager (see components/AnalyticsConsent.tsx): allowed by the policy, but only ever loaded after a visitor accepts, and never on private pages.
const tagManager = 'https://www.googletagmanager.com';
const googleAnalytics = 'https://www.google-analytics.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://stats.g.doubleclick.net';
const scriptSources =
  (process.env.NODE_ENV === 'development' ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'") + ` ${tagManager}`;
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources}`,
  "style-src 'self' 'unsafe-inline'",
  // lh3.googleusercontent.com serves the profile picture of someone who signs in with Google.
  `img-src 'self' data: blob: ${supabaseOrigin} https://lh3.googleusercontent.com ${googleAnalytics}`,
  `connect-src 'self' ${supabaseOrigin} ${sentryOrigin} ${googleAnalytics}`.trim(),
  "font-src 'self' data:",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');
const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), microphone=(), payment=(self)' },
  ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
];

const nextConfig: NextConfig = {
  // PostHog's endpoints end in a slash (/e/, /decide/), which must reach it as written.
  skipTrailingSlashRedirect: true,
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: supabase
      ? [new URL(`${supabase.origin}/storage/v1/object/public/product-images/**`)]
      : [],
    // The local Supabase stack runs on 127.0.0.1, which Next.js refuses to fetch from by default. Only that exact
    // path is allowed above, and hosted projects never take this branch.
    dangerouslyAllowLocalIP: localSupabase,
  },
  // Private pages never belong in search results (robots.txt alone doesn't stop a linked page from being listed).
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const privateRoutes = ['/admin/:path*', '/account/:path*', '/bag', '/checkout', '/orders/:path*', '/saved', '/track', '/auth/:path*', '/api/:path*'];
    return [
      { source: '/:path*', headers: securityHeaders },
      ...privateRoutes.map((source) => ({ source, headers: [...securityHeaders, ...noindex] })),
    ];
  },
  // PostHog analytics are sent to this site and forwarded, so the browser only ever talks to us.
  async rewrites() {
    return [
      { source: '/ingest/static/:path*', destination: `https://${posthogRegion}-assets.i.posthog.com/static/:path*` },
      { source: '/ingest/array/:path*', destination: `https://${posthogRegion}-assets.i.posthog.com/array/:path*` },
      { source: '/ingest/:path*', destination: `https://${posthogRegion}.i.posthog.com/:path*` },
    ];
  },
  async redirects() {
    return [
      // "Shop by age" was removed; old links and search results go to the kids' department.
      { source: '/shop-by-age/:path*', destination: '/shop/kids', permanent: true },
    ];
  },
};

// Source maps are uploaded to Sentry (so errors show the real code) only when SENTRY_AUTH_TOKEN, SENTRY_ORG and
// SENTRY_PROJECT are set for the build; without them this changes nothing.
export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true },
});
