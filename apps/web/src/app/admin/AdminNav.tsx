'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { IconName } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import type { StaffRole } from '@/lib/admin/session';
import styles from './admin.module.css';

interface NavLink {
  href: string;
  label: string;
  icon: IconName;
}

interface NavGroup {
  /** Shown above the links; the first group has none. */
  heading?: string;
  adminOnly?: boolean;
  links: NavLink[];
}

const groups: NavGroup[] = [
  { links: [{ href: '/admin', label: 'Dashboard', icon: 'grid' }] },
  {
    heading: 'Sales',
    links: [
      { href: '/admin/orders', label: 'Orders', icon: 'bag' },
      { href: '/admin/returns', label: 'Returns', icon: 'refresh' },
      { href: '/admin/finance', label: 'Finance', icon: 'clipboard' },
      { href: '/admin/support', label: 'Support', icon: 'headset' },
      { href: '/admin/reviews', label: 'Reviews', icon: 'star' },
    ],
  },
  {
    heading: 'Stock & content',
    links: [
      { href: '/admin/products', label: 'Products', icon: 'box' },
      { href: '/admin/inventory', label: 'Inventory', icon: 'layers' },
      { href: '/admin/content', label: 'Content', icon: 'image' },
    ],
  },
  {
    heading: 'Fulfilment',
    links: [
      { href: '/admin/riders', label: 'Riders', icon: 'truck' },
      { href: '/admin/delivery', label: 'Delivery', icon: 'pin' },
    ],
  },
  {
    heading: 'Manage',
    adminOnly: true,
    links: [
      { href: '/admin/staff', label: 'Staff', icon: 'users' },
      { href: '/admin/audit', label: 'Audit log', icon: 'clipboard' },
      { href: '/admin/settings', label: 'Settings', icon: 'sliders' },
    ],
  },
];

/** Pages only admins may open (the database enforces the same rule). */
const adminOnlyLinks = new Set(['/admin/delivery']);

export function AdminNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const isAdmin = role === 'admin';
  return (
    <nav aria-label="Admin" className={styles.nav}>
      {groups
        .filter((group) => isAdmin || !group.adminOnly)
        .map((group) => {
          const links = group.links.filter((l) => isAdmin || !adminOnlyLinks.has(l.href));
          if (links.length === 0) return null;
          return (
            <div key={group.heading ?? 'overview'} className={styles.navGroup}>
              {group.heading && <p className={styles.navHeading}>{group.heading}</p>}
              {links.map((l) => {
                const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
                return (
                  <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
                    <Icon name={l.icon} size={18} strokeWidth={1.7} />
                    <span>{l.label}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
    </nav>
  );
}
