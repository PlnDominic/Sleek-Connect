'use client';

import { useEffect } from 'react';

/**
 * Tells the store a search found nothing, but only once the shopper has stayed on that result for two seconds. Words typed on the way
 * to a longer search ("ser", "seru") replace this page before then, so they are never counted. Renders nothing.
 */
export function SearchMissBeacon({ query }: { query: string }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      void fetch('/api/search/miss', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ q: query }),
        keepalive: true,
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [query]);
  return null;
}
