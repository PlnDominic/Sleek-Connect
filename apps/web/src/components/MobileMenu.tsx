'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Icon } from './Icon';
import styles from './header.module.css';

export interface MenuDepartment {
  id: string;
  label: string;
  categories: { id: string; name: string }[];
}

export interface MenuLink {
  label: string;
  href: string;
}

/** The phone menu: a button in the header that opens a slide-in drawer with search, departments and links. */
export function MobileMenu({ departments, links }: { departments: MenuDepartment[]; links: MenuLink[] }) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closer.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const button = opener.current;
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
      button?.focus();
    };
  }, [open]);

  // Following any link in the drawer closes it.
  const onNavigate = (event: MouseEvent) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };

  return (
    <>
      <button
        ref={opener}
        type="button"
        className={styles.menuButton}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-menu"
        onClick={() => setOpen(true)}
      >
        <span className={styles.burger} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.drawerRoot}>
          <button type="button" className={styles.scrim} aria-label="Close menu" tabIndex={-1} onClick={() => setOpen(false)} />
          <div id="mobile-menu" role="dialog" aria-modal="true" aria-label="Menu" className={styles.drawer}>
            <div className={styles.drawerHead}>
              <strong>Menu</strong>
              <button ref={closer} type="button" className={styles.drawerClose} aria-label="Close menu" onClick={() => setOpen(false)}>
                <span aria-hidden="true">✕</span>
              </button>
            </div>
            <form role="search" action="/search" className={styles.drawerSearch}>
              <Icon name="search" size={18} />
              <input name="q" type="search" placeholder="Search products and brands" aria-label="Search products" />
            </form>
            <nav aria-label="Menu" className={styles.drawerNav} onClick={onNavigate}>
              <Link href="/shop" className={styles.drawerLink}>
                Shop all products
              </Link>
              {departments.map((d) => (
                <details key={d.id} className={styles.drawerGroup}>
                  <summary>
                    {d.label}
                    <Icon name="chevronDown" size={16} strokeWidth={2} />
                  </summary>
                  <div className={styles.drawerSub}>
                    <Link href={`/shop/${d.id}`}>Shop all {d.label}</Link>
                    {d.categories.map((c) => (
                      <Link key={c.id} href={`/shop/${d.id}/${c.id}`}>
                        {c.name}
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
              <div className={styles.drawerRule} />
              {links.map((l) => (
                <Link key={l.href} href={l.href} className={styles.drawerLink}>
                  {l.label}
                </Link>
              ))}
              <div className={styles.drawerRule} />
              <Link href="/account" className={styles.drawerLink}>
                Your account
              </Link>
              <Link href="/saved" className={styles.drawerLink}>
                Saved items
              </Link>
              <Link href="/track" className={styles.drawerLink}>
                Track an order
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
