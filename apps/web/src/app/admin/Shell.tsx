'use client';

import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { TopBar } from './TopBar';
import styles from './shell.module.css';

interface ShellProps {
  sidebar: ReactNode;
  user: { name: string; role: string; avatar?: string };
  /** The account menu's content (it holds the sign-out button). */
  menu: ReactNode;
  children: ReactNode;
}

/** Sidebar, top bar and page. On phones the sidebar slides in from the left and closes when you pick a page. */
export function Shell({ sidebar, user, menu, children }: ShellProps) {
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  return (
    <div className={styles.shell}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <aside className={styles.sidebar} data-open={open || undefined}>
        {sidebar}
      </aside>
      {open && <button type="button" className={styles.scrim} aria-label="Close menu" onClick={() => setOpenFor(null)} />}
      <div className={styles.main}>
        <TopBar {...user} menu={menu} onMenu={() => setOpenFor(pathname)} />
        <main id="main" tabIndex={-1} className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
