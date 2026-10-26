'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import type { IconName } from '@sleek/shared';
import shell from './shell.module.css';

const links: { href: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { href: '/vendor', label: 'Overview', icon: 'grid', match: (p) => p === '/vendor' },
  { href: '/vendor/products/new', label: 'Add a product', icon: 'plus', match: (p) => p === '/vendor/products/new' },
  { href: '/vendor/store', label: 'Store page', icon: 'store', match: (p) => p === '/vendor/store' },
];

const titles = (path: string): [string, string] => {
  if (path === '/vendor') return ['Overview', 'Your store at a glance'];
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
  children,
}: {
  store: string;
  slug: string;
  status: { label: string; tone: 'good' | 'warn' };
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
