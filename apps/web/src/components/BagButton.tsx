'use client';

import Link from 'next/link';
import { useBag } from '@sleek/shared/bag';
import { Icon } from './Icon';
import styles from './chrome.module.css';

export function BagButton({ variant }: { variant: 'icon' | 'pill' }) {
  const { count } = useBag();
  const label = `Bag, ${count} ${count === 1 ? 'item' : 'items'}`;

  if (variant === 'pill') {
    return (
      <Link href="/bag" aria-label={label} className={styles.bagPill}>
        <Icon name="bag" />
        Bag <span className={styles.bagPillCount}>{count}</span>
      </Link>
    );
  }

  return (
    <Link href="/bag" aria-label={label} className={styles.iconButton}>
      <Icon name="bag" size={21} />
      {count > 0 && <span className={styles.badge}>{count}</span>}
    </Link>
  );
}
