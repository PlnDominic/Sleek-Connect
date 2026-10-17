'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { StaffRole } from '@/lib/admin/session';
import styles from './admin.module.css';

const links = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/inventory', label: 'Inventory' },
  { href: '/admin/returns', label: 'Returns' },
  { href: '/admin/support', label: 'Support' },
  { href: '/admin/content', label: 'Content' },
  { href: '/admin/riders', label: 'Riders' },
  { href: '/admin/staff', label: 'Staff', adminOnly: true },
  { href: '/admin/delivery', label: 'Delivery', adminOnly: true },
  { href: '/admin/audit', label: 'Audit log', adminOnly: true },
  { href: '/admin/settings', label: 'Settings', adminOnly: true },
];

export function AdminNav({ role }: { role: StaffRole }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className={styles.nav}>
      {links
        .filter((l) => !l.adminOnly || role === 'admin')
        .map((l) => {
          const active = l.href === '/admin' ? pathname === '/admin' : pathname.startsWith(l.href);
          return (
            <Link key={l.href} href={l.href} aria-current={active ? 'page' : undefined}>
              {l.label}
            </Link>
          );
        })}
    </nav>
  );
}
