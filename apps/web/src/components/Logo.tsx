import Link from 'next/link';
import styles from './chrome.module.css';

export function Logo({ size = 24, onDark = false }: { size?: number; onDark?: boolean }) {
  const content = (
    <>
      Sleek<span className={onDark ? styles.logoAccentOnDark : styles.logoAccent}>Connect</span>
    </>
  );
  if (onDark) {
    return (
      <span className={`${styles.logo} ${styles.logoOnDark}`} style={{ fontSize: size }}>
        {content}
      </span>
    );
  }
  return (
    <Link href="/" className={styles.logo} style={{ fontSize: size }}>
      {content}
    </Link>
  );
}
