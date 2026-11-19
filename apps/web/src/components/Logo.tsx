import Image from 'next/image';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import styles from './chrome.module.css';

export function Logo({ size = 24, onDark = false, href = '/' }: { size?: number; onDark?: boolean; href?: string }) {
  // A custom property rather than font-size, so small screens can scale the wordmark down (chrome.module.css).
  const style = { '--logo-size': `${size}px` } as CSSProperties;
  const content = (
    <>
      {/* The emblem sits on a white tile so its navy stays visible in the dark theme. */}
      <span className={styles.logoTile} aria-hidden="true">
        <Image src="/brand/logo-mark.png" alt="" width={72} height={80} className={styles.logoImage} />
      </span>
      <span>
        Sleek <span className={onDark ? styles.logoAccentOnDark : styles.logoAccent}>Connect</span> Store
      </span>
    </>
  );
  if (onDark) {
    return (
      <span className={`${styles.logo} ${styles.logoOnDark}`} style={style}>
        {content}
      </span>
    );
  }
  return (
    <Link href={href} className={styles.logo} style={style}>
      {content}
    </Link>
  );
}
