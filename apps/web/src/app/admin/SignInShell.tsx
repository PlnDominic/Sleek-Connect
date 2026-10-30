import Link from 'next/link';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';
import styles from './signin.module.css';

/** The frame around the staff sign-in screens: one centred card on a soft background. */
export function SignInShell({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.card}>
        <div className={styles.cardLogo}>
          <Logo size={22} />
          <span className={styles.staffTag}>Staff</span>
        </div>
        {children}
      </div>
      <Link href="/" className={styles.back}>
        ← Back to the store
      </Link>
    </main>
  );
}
