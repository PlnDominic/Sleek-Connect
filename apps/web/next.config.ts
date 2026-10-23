import type { NextConfig } from 'next';

// Product photos live in the public product-images bucket of the Supabase project.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;
const localSupabase = supabase !== null && ['127.0.0.1', 'localhost'].includes(supabase.hostname);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: supabase ? [new URL(`${supabase.origin}/storage/v1/object/public/product-images/**`)] : [],
    // The local Supabase stack runs on 127.0.0.1, which Next.js refuses to fetch from by default. Only that exact
    // path is allowed above, and hosted projects never take this branch.
    dangerouslyAllowLocalIP: localSupabase,
  },
  // Private pages never belong in search results (robots.txt alone doesn't stop a linked page from being listed).
  async headers() {
    const noindex = [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }];
    return ['/admin/:path*', '/account/:path*', '/bag', '/checkout', '/orders/:path*', '/saved', '/track', '/auth/:path*', '/api/:path*'].map(
      (source) => ({ source, headers: noindex }),
    );
  },
  async redirects() {
    return [
      // Shop by age opens on toddlers, the band the design shows by default.
      { source: '/shop-by-age', destination: '/shop-by-age/1-2y', permanent: false },
    ];
  },
};

export default nextConfig;
