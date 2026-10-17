'use client';

import Link from 'next/link';
import { Icon } from './Icon';
import { useWishlist } from './WishlistProvider';
import styles from './chrome.module.css';

/** Header link to the saved items, with how many there are. */
export function SavedLink({ className }: { className?: string }) {
  const { slugs } = useWishlist();
  const count = slugs.length;
  return (
    <Link
      href="/saved"
      aria-label={`Saved items, ${count} ${count === 1 ? 'item' : 'items'}`}
      className={`${styles.iconButton} ${className ?? ''}`}
    >
      <Icon name="heart" size={21} />
      {count > 0 && <span className={styles.badge}>{count}</span>}
    </Link>
  );
}
