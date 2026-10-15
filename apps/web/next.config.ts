import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  async redirects() {
    return [
      // Shop by age opens on toddlers, the band the design shows by default.
      { source: '/shop-by-age', destination: '/shop-by-age/1-2y', permanent: false },
    ];
  },
};

export default nextConfig;
