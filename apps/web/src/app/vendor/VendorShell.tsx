'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import type { IconName } from '@sleek/shared';
import shell from './shell.module.css';

type Badge = 'orders' | 'messages';

const links: { href: string; label: string; icon: IconName; match: (p: string) => boolean; badge?: Badge }[] = [
  { href: '/vendor', label: 'Overview', icon: 'grid', match: (p) => p === '/vendor' },
  { href: '/vendor/orders', label: 'Orders', icon: 'truck', match: (p) => p === '/vendor/orders', badge: 'orders' },
  { href: '/vendor/products/new', label: 'Add a product', icon: 'plus', match: (p) => p === '/vendor/products/new' || p === '/vendor/products/import' },
  { href: '/vendor/earnings', label: 'Earnings', icon: 'card', match: (p) => p === '/vendor/earnings' },
  { href: '/vendor/reports', label: 'Sales reports', icon: 'layers', match: (p) => p === '/vendor/reports' },
  { href: '/vendor/messages', label: 'Messages', icon: 'chat', match: (p) => p === '/vendor/messages', badge: 'messages' },
  { href: '/vendor/store', label: 'Store page', icon: 'store', match: (p) => p === '/vendor/store' },
];

const titles = (path: string): [string, string] => {
  if (path === '/vendor') return ['Overview', 'Your store at a glance'];
  if (path === '/vendor/orders') return ['Orders', 'Pack what shoppers have paid for'];
  if (path === '/vendor/earnings') return ['Earnings', 'What you are owed and what we have paid'];
  if (path === '/vendor/reports') return ['Sales reports', 'How your products are selling'];
  if (path === '/vendor/messages') return ['Messages', 'Talk to the Sleek Connect team'];
  if (path === '/vendor/products/import') return ['Add many products', 'Upload a spreadsheet'];
  if (path === '/vendor/store') return ['Store page', 'Your name, logo and description'];
  if (path === '/vendor/products/new') return ['Add a product', 'It goes on sale once we approve it'];
  if (path.startsWith('/vendor/products/')) return ['Edit product', 'Photos, price and details'];
  return ['Your store', ''];
};

/** The vendor dashboard frame: sidebar and top bar, laid out like the admin. */
export function VendorShell({
  store,
  slug,
  status,
  badges,
  children,
}: {
  store: string;
  slug: string;
  status: { label: string; tone: 'good' | 'warn' };
  /** Orders waiting to be packed and unread messages from us. */
  badges: Record<Badge, number>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;
  const [title, subtitle] = titles(pathname);
  return (
    <div className={shell.shell}>
      <aside className={shell.sidebar} data-open={open || undefined}>
        <Link href="/vendor" className={shell.brand}>
          <span className={shell.brandMark} aria-hidden="true">
            {store.slice(0, 1).toUpperCase()}
          </span>
          <span className={shell.brandText}>
            <strong>{store}</strong>
            <span>Vendor dashboard</span>
          </span>
        </Link>
        <nav aria-label="Vendor" className={shell.nav}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={shell.item} aria-current={l.match(pathname) ? 'page' : undefined}>
              <Icon name={l.icon} size={18} strokeWidth={1.7} />
              {l.label}
              {l.badge && badges[l.badge] > 0 && (
                <span className={shell.count} aria-label={`${badges[l.badge]} waiting`}>
                  {badges[l.badge]}
                </span>
              )}
            </Link>
          ))}
          <Link href="/vendor" className={shell.item} aria-current={pathname.startsWith('/vendor/products/') && pathname !== '/vendor/products/new' ? 'page' : undefined}>
            <Icon name="box" size={18} strokeWidth={1.7} />
            Products
          </Link>
        </nav>
        <div className={shell.sideFoot}>
          <Link href={`/store/${slug}`} className={shell.item} target="_blank">
            <Icon name="arrowRight" size={18} strokeWidth={1.7} />
            View my storefront
          </Link>
          <Link href="/" className={shell.item}>
            <Icon name="home" size={18} strokeWidth={1.7} />
            Back to the shop
          </Link>
        </div>
      </aside>
      {open && <button type="button" className={shell.scrim} aria-label="Close menu" onClick={() => setOpenFor(null)} />}
      <div className={shell.main}>
        <header className={shell.topbar}>
          <button type="button" className={shell.menuButton} onClick={() => setOpenFor(pathname)} aria-label="Open menu">
            <Icon name="sliders" size={18} />
          </button>
          <div className={shell.topTitle}>
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </div>
          <span className={shell.status} data-tone={status.tone}>
            {status.label}
          </span>
        </header>
        <main id="main" className={shell.content}>
          {children}
        </main>
      </div>
    </div>
  );
}
