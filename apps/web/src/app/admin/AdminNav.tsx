'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { StaffRole } from '@/lib/admin/session';
import styles from './admin.module.css';

interface NavLink {
  href: string;
  label: string;
}

interface NavGroup {
  /** Shown above the links; the first group has none. */
  heading?: string;
  adminOnly?: boolean;
  links: NavLink[];
}

const groups: NavGroup[] = [
  { links: [{ href: '/admin', label: 'Dashboard' }] },
  {
    heading: 'Sales',
    links: [
      { href: '/admin/orders', label: 'Orders' },
      { href: '/admin/returns', label: 'Returns' },
      { href: '/admin/finance', label: 'Finance' },
      { href: '/admin/notifications', label: 'Notifications' },
      { href: '/admin/support', label: 'Support' },
      { href: '/admin/reviews', label: 'Reviews' },
    ],
  },
  {
    heading: 'Stock & content',
    links: [
      { href: '/admin/products', label: 'Products' },
      { href: '/admin/inventory', label: 'Inventory' },
      { href: '/admin/content', label: 'Content' },
    ],
  },
  {
    heading: 'Fulfilment',
    links: [
      { href: '/admin/riders', label: 'Riders' },
      { href: '/admin/delivery', label: 'Delivery' },
    ],
  },
  {
    heading: 'Manage',
    adminOnly: true,
    links: [
      { href: '/admin/vendors', label: 'Vendors' },
      { href: '/admin/staff', label: 'Staff' },
      { href: '/admin/audit', label: 'Audit log' },
      { href: '/admin/settings', label: 'Settings' },
    ],
  },
];

/** Pages only admins may open (the database enforces the same rule). */
const adminOnlyLinks = new Set(['/admin/delivery']);

export function AdminNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const isAdmin = role === 'admin';
  // On phones the links sit behind a Menu button; moving to another page closes it again.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  return (
    <div className={styles.navWrap}>
      <button
        type="button"
        className={styles.menuToggle}
        aria-expanded={open}
        aria-controls="admin-nav"
        onClick={() => setOpenFor(open ? null : pathname)}
      >
        {open ? 'Close menu' : 'Menu'}
      </button>
      <div id="admin-nav" className={styles.navPanel} data-open={open || undefined}>
        <form action="/admin/search" role="search" className={styles.navSearch}>
          <input name="q" type="search" placeholder="Search orders, products…" aria-label="Search the admin" autoComplete="off" />
        </form>
        <nav aria-label="Admin" className={styles.nav}>
          {groups
            .filter((group) => isAdmin || !group.adminOnly)
            .map((group) => {
              const links = group.links.filter((l) => isAdmin || !adminOnlyLinks.has(l.href));
              if (links.length === 0) return null;
              const items = links.map((l) => {
                const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
                return (
                  <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
                    {l.label}
                  </Link>
                );
              });
              // Groups with a heading fold away; the one holding the current page starts open.
              if (!group.heading) {
                return (
                  <div key="overview" className={styles.navGroup}>
                    {items}
                  </div>
                );
              }
              return (
                <details key={group.heading} className={styles.navGroup} open>
                  <summary className={styles.navHeading}>{group.heading}</summary>
                  <div className={styles.navLinks}>{items}</div>
                </details>
              );
            })}
        </nav>
      </div>
    </div>
  );
}
