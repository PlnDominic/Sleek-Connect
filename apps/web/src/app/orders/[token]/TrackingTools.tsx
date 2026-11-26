'use client';

import { useEffect, useState } from 'react';
import { rememberOrder } from '@/lib/recent-orders';
import styles from './order.module.css';

/** Keeps this order in the device's recent orders (for /track) and offers to copy or share the tracking link. */
export function TrackingTools({ token, orderNumber }: { token: string; orderNumber: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    rememberOrder({ token, orderNumber });
  }, [token, orderNumber]);

  const share = async () => {
    const url = window.location.href.split('?')[0];
    try {
      if (navigator.share) {
        await navigator.share({ title: `Order ${orderNumber}`, text: `Track Sleek Connect order ${orderNumber}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Cancelled or blocked: nothing to do.
    }
  };

  return (
    <button type="button" className={styles.secondary} onClick={share}>
      {copied ? 'Link copied' : 'Share tracking link'}
    </button>
  );
}
