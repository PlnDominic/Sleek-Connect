'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './admin.module.css';

const labels: Record<string, string> = {
  orders: 'Orders',
  returns: 'Returns',
  finance: 'Finance',
  notifications: 'Notifications',
  support: 'Support',
  reviews: 'Reviews',
  products: 'Products',
  inventory: 'Inventory',
  content: 'Content',
  riders: 'Riders',
  delivery: 'Delivery',
  vendors: 'Vendors',
  staff: 'Staff',
  audit: 'Audit log',
  settings: 'Settings',
  search: 'Search',
  new: 'New',
  import: 'Import',
  template: 'Template',
  export: 'Export',
  slip: 'Packing slip',
};

const isId = (segment: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment);

/** Where you are, and a way back up, on every page below the dashboard. */
export function Breadcrumbs() {
  const segments = (usePathname() ?? '').split('/').filter(Boolean).slice(1);
  if (segments.length === 0) return null;
  const crumbs = segments.map((segment, i) => ({
    href: `/admin/${segments.slice(0, i + 1).join('/')}`,
    label: labels[segment] ?? (isId(segment) ? 'Details' : decodeURIComponent(segment)),
  }));
  return (
    <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
      <ol>
        <li>
          <Link href="/admin">Dashboard</Link>
        </li>
        {crumbs.map((c, i) => (
          <li key={c.href}>
            {i === crumbs.length - 1 ? (
              <span aria-current="page">{c.label}</span>
            ) : (
              <Link href={c.href}>{c.label}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
