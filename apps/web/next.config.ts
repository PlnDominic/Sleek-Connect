import type { NextConfig } from 'next';

// Product photos live in the public product-images bucket of the Supabase project.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
const localSupabase = supabase !== null && ['127.0.0.1', 'localhost'].includes(supabase.hostname);
const supabaseOrigin = supabase?.origin ?? '';
const scriptSources = process.env.NODE_ENV === 'development' ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`,
  `connect-src 'self' ${supabaseOrigin}`,
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
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: supabase
      ? [
          new URL(`${supabase.origin}/storage/v1/object/public/product-images/**`),
          new URL(`${supabase.origin}/storage/v1/object/public/vendor-assets/**`),
        ]
      : [],
    // The local Supabase stack runs on 127.0.0.1, which Next.js refuses to fetch from by default. Only that exact
    // path is allowed above, and hosted projects never take this branch.
    dangerouslyAllowLocalIP: localSupabase,
  },
  // Private pages never belong in search results (robots.txt alone doesn't stop a linked page from being listed).
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    const privateRoutes = ['/admin/:path*', '/account/:path*', '/bag', '/checkout', '/orders/:path*', '/saved', '/track', '/vendor/:path*', '/auth/:path*', '/api/:path*'];
    return [
      { source: '/:path*', headers: securityHeaders },
      ...privateRoutes.map((source) => ({ source, headers: [...securityHeaders, ...noindex] })),
    ];
  },
  async redirects() {
    return [
      // Shop by age opens on toddlers, the band the design shows by default.
      { source: '/shop-by-age', destination: '/shop-by-age/1-2y', permanent: false },
    ];
  },
};

export default nextConfig;
