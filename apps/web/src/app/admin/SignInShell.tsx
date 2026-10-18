import Link from 'next/link';
import type { ReactNode } from 'react';
import type { IconName } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import styles from './signin.module.css';

const highlights: { icon: IconName; title: string; text: string }[] = [
  { icon: 'truck', title: 'Orders and delivery', text: 'Pack, dispatch and prove every delivery.' },
  { icon: 'box', title: 'Stock and batches', text: 'Expiry dates, recalls and low-stock alerts.' },
  { icon: 'headset', title: 'Returns and support', text: 'Answer customers and settle returns.' },
];

/** The frame around the staff sign-in screens: a brand panel beside the sign-in card. */
export function SignInShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.page}>
      <aside className={styles.brand}>
        <span className={styles.ring} aria-hidden="true" />
        <Logo size={26} onDark />
        <div className={styles.pitch}>
          <span className={styles.eyebrow}>
            <span className={styles.dot} aria-hidden="true" />
            Staff area
          </span>
          <p className={styles.pitchTitle}>
            Run the store from <em>one calm place.</em>
          </p>
          <p className={styles.pitchText}>
            Everything the team needs to keep orders moving and customers happy, in one place.
          </p>
          <ul className={styles.highlights}>
            {highlights.map((h) => (
              <li key={h.title}>
                <span className={styles.highlightIcon}>
                  <Icon name={h.icon} size={20} strokeWidth={1.7} />
                </span>
                <span className={styles.highlightText}>
                  <strong>{h.title}</strong>
                  <span className={styles.highlightDesc}>{h.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <p className={styles.legal}>© 2026 Sleek Connect Store · Accra, Ghana</p>
      </aside>
      <main className={styles.panel}>
        <div className={styles.card}>{children}</div>
        <Link href="/" className={styles.back}>
          ← Back to the store
        </Link>
      </main>
    </div>
  );
}
