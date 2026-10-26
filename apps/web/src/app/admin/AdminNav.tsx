'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { IconName } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import type { StaffRole } from '@/lib/admin/session';
import styles from './shell.module.css';

interface NavLink {
  href: string;
  label: string;
}

interface NavGroup {
  label: string;
  icon: IconName;
  adminOnly?: boolean;
  links: NavLink[];
}

const groups: NavGroup[] = [
  {
    label: 'Sales',
    icon: 'bag',
    links: [
      { href: '/admin/orders', label: 'Orders' },
      { href: '/admin/returns', label: 'Returns' },
      { href: '/admin/finance', label: 'Finance' },
    ],
  },
  {
    label: 'Customers',
    icon: 'headset',
    links: [
      { href: '/admin/support', label: 'Support' },
      { href: '/admin/reviews', label: 'Reviews' },
      { href: '/admin/notifications', label: 'Notifications' },
    ],
  },
  {
    label: 'Catalogue',
    icon: 'box',
    links: [
      { href: '/admin/products', label: 'Products' },
      { href: '/admin/inventory', label: 'Inventory' },
      { href: '/admin/content', label: 'Content' },
    ],
  },
  {
    label: 'Delivery',
    icon: 'truck',
    links: [
      { href: '/admin/riders', label: 'Riders' },
      { href: '/admin/delivery', label: 'Areas and fees' },
    ],
  },
  { label: 'Marketplace', icon: 'store', adminOnly: true, links: [{ href: '/admin/vendors', label: 'Vendors' }] },
  {
    label: 'Settings',
    icon: 'sliders',
    adminOnly: true,
    links: [
      { href: '/admin/settings', label: 'Store settings' },
      { href: '/admin/staff', label: 'Staff' },
      { href: '/admin/audit', label: 'Audit log' },
    ],
  },
];

/** Pages only admins may open (the database enforces the same rule). */
const adminOnlyLinks = new Set(['/admin/delivery']);

/** The sidebar: Dashboard, then sections that fold open. The section holding the current page starts open. */
export function AdminNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  const isAdmin = role === 'admin';
  const visible = groups
    .filter((g) => isAdmin || !g.adminOnly)
    .map((g) => ({ ...g, links: g.links.filter((l) => isAdmin || !adminOnlyLinks.has(l.href)) }))
    .filter((g) => g.links.length > 0);
  const activeGroup = visible.find((g) => g.links.some((l) => pathname.startsWith(l.href)))?.label;
  const [open, setOpen] = useState<Set<string>>(() => new Set(activeGroup ? [activeGroup] : []));
  const isOpen = (label: string) => open.has(label) || label === activeGroup;

  return (
    <nav aria-label="Admin" className={styles.nav}>
      <Link href="/admin" className={styles.item} aria-current={pathname === '/admin' ? 'page' : undefined}>
        <Icon name="grid" size={18} strokeWidth={1.7} />
        <span className={styles.itemLabel}>Dashboard</span>
        {pathname === '/admin' && <span className={styles.activeDot} aria-hidden="true" />}
      </Link>
      {visible.map((g) => {
        const expanded = isOpen(g.label);
        const id = `nav-${g.label.toLowerCase()}`;
        return (
          <div key={g.label} className={styles.group}>
            <button
              type="button"
              className={styles.item}
              data-active={g.label === activeGroup || undefined}
              aria-expanded={expanded}
              aria-controls={id}
              onClick={() =>
                setOpen((all) => {
                  const next = new Set(all);
                  if (expanded) {
                    next.delete(g.label);
                  } else {
                    next.add(g.label);
                  }
                  return next;
                })
              }
            >
              <Icon name={g.icon} size={18} strokeWidth={1.7} />
              <span className={styles.itemLabel}>{g.label}</span>
              <Icon name="chevronDown" size={15} strokeWidth={2} className={styles.chevron} />
            </button>
            {expanded && (
              <div id={id} className={styles.children}>
                {g.links.map((l) => (
                  <Link key={l.href} href={l.href} aria-current={pathname.startsWith(l.href) ? 'page' : undefined}>
                    {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
