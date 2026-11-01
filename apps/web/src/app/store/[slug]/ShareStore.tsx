'use client';

import { useState } from 'react';
import styles from './store.module.css';

/** Share this store: the phone's share sheet when there is one, otherwise copy the link. */
export function ShareStore({ name }: { name: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) return await navigator.share({ title: name, url });
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The shopper closed the share sheet, or the browser refused: nothing to do.
    }
  };
  return (
    <button type="button" className={styles.shareButton} onClick={share}>
      {copied ? 'Link copied' : 'Share'}
    </button>
  );
}
