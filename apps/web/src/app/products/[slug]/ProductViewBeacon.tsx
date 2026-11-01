'use client';

import { useEffect } from 'react';

/** Tells the store a product page was opened (a number per product per day; see /api/track/view). Renders nothing. */
export function ProductViewBeacon({ slug }: { slug: string }) {
  useEffect(() => {
    if (navigator.doNotTrack === '1') return;
    void fetch('/api/track/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
      keepalive: true,
    }).catch(() => {});
  }, [slug]);
  return null;
}
