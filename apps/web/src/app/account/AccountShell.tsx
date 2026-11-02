'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useAuth } from '@/components/AuthProvider';
import styles from './account.module.css';

const groups: { title: string; links: { href: string; label: string; match?: (p: string) => boolean }[] }[] = [
  {
    title: 'My account',
    links: [
      { href: '/account', label: 'Account overview', match: (p) => p === '/account' },
      { href: '/account/orders', label: 'Orders' },
      { href: '/account/reviews', label: 'Pending reviews' },
      { href: '/saved', label: 'Saved items' },
      { href: '/account/stores', label: 'Followed stores' },
      { href: '/account/recently-viewed', label: 'Recently viewed' },
    ],
  },
  {
    title: 'Account management',
    links: [
      { href: '/account/details', label: 'Account details' },
      { href: '/account/addresses', label: 'Address book' },
      { href: '/account/payment-methods', label: 'Mobile Money numbers' },
      { href: '/account/privacy', label: 'Privacy and your data' },
    ],
  },
];

/**
 * The account area frame, like the "My account" pages on big marketplaces: a menu on the left, the page on the right. Signed-out
 * visitors only see the page (the sign-in card), centred.
 */
export function AccountShell({ children }: { children: ReactNode }) {
  const { user, loading, signOut } = useAuth();
  const pathname = usePathname();
  if (loading || !user) {
    // A guest's saved items (kept on this device) get a normal wide page; the sign-in card is centred.
    return <main className={`container ${styles.main} ${pathname.startsWith('/saved') ? styles.guestPage : styles.centered}`}>{children}</main>;
  }
  return (
    <main className={`container ${styles.shell}`}>
      <nav className={styles.sideNav} aria-label="My account">
        {groups.map((group) => (
          <div key={group.title} className={styles.navGroup}>
            <span className={styles.navTitle}>{group.title}</span>
            {group.links.map((l) => {
              const current = l.match ? l.match(pathname) : pathname === l.href || pathname.startsWith(`${l.href}/`);
              return (
                <Link key={l.href} href={l.href} className={styles.navLink} aria-current={current ? 'page' : undefined}>
                  {l.label}
                </Link>
              );
            })}
          </div>
        ))}
        <button type="button" className={styles.navLogout} onClick={() => void signOut()}>
          Sign out
        </button>
      </nav>
      <div className={styles.content}>{children}</div>
    </main>
  );
}
