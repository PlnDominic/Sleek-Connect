'use client';

import Link from 'next/link';
import { useBag } from '@sleek/shared/bag';
import { Icon } from './Icon';
import styles from './chrome.module.css';

/** The bag icon in the header, with how many items are in it. */
export function BagButton() {
  const { count } = useBag();
  const label = `Bag, ${count} ${count === 1 ? 'item' : 'items'}`;

  return (
    <Link href="/bag" aria-label={label} className={styles.iconButton}>
      <Icon name="bag" size={21} />
      {count > 0 && <span className={styles.badge}>{count}</span>}
    </Link>
  );
}
