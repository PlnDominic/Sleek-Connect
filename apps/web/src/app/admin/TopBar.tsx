'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/Icon';
import styles from './shell.module.css';

const titles: Record<string, [string, string]> = {
  '': ['Dashboard', 'Overview of your store today'],
  orders: ['Orders', 'Pack, dispatch and deliver'],
  returns: ['Returns', 'Requests, inspections and refunds'],
  finance: ['Finance', 'Payments and refunds'],
  support: ['Support', 'Messages from customers'],
  reviews: ['Reviews', 'Check reviews before they go live'],
  notifications: ['Notifications', 'Texts and emails to customers'],
  products: ['Products', 'Your catalogue'],
  inventory: ['Inventory', 'Stock, batches and expiry'],
  content: ['Content', 'Home page banners and featured products'],
  riders: ['Riders', 'Who delivers your orders'],
  delivery: ['Delivery', 'Areas, fees and delivery times'],
  vendors: ['Vendors', 'Marketplace stores and their products'],
  settings: ['Settings', 'Store-wide rules'],
  staff: ['Staff', 'Who can use the admin'],
  audit: ['Audit log', 'Every sensitive change'],
  search: ['Search', 'Orders, products and vendors'],
};

/**
 * The bar above every admin page: where you are, search (⌘K or Ctrl+K), notifications, the store and your account.
 * `menu` is the account menu's content (it holds the server-rendered sign-out button).
 */
export function TopBar({
  name,
  role,
  avatar,
  onMenu,
  menu,
}: {
  name: string;
  role: string;
  avatar?: string;
  onMenu?: () => void;
  menu: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const search = useRef<HTMLInputElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [title, subtitle] = titles[pathname.split('/')[2] ?? ''] ?? titles[''];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === 'Escape') setAccountOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className={styles.topbar}>
      {onMenu && (
        <button type="button" className={styles.iconButton} onClick={onMenu} aria-label="Open menu" data-mobile-only>
          <Icon name="sliders" size={18} />
        </button>
      )}
      <div className={styles.topTitle}>
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </div>
      <form
        role="search"
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          const q = search.current?.value.trim();
          if (q) router.push(`/admin/search?q=${encodeURIComponent(q)}`);
        }}
      >
        <Icon name="search" size={17} />
        <input ref={search} name="q" type="search" placeholder="Search anything…" aria-label="Search the admin" autoComplete="off" />
        <kbd aria-hidden="true">⌘K</kbd>
      </form>
      <Link href="/admin/notifications" className={styles.iconButton} aria-label="Notifications">
        <Icon name="bell" size={19} />
      </Link>
      <Link href="/" className={styles.iconButton} aria-label="Open the store in a new tab" target="_blank">
        <Icon name="store" size={19} />
      </Link>
      <div className={styles.account}>
        <button type="button" className={styles.accountButton} aria-label="Account menu" aria-expanded={accountOpen} onClick={() => setAccountOpen((o) => !o)}>
          <span className={styles.avatar} aria-hidden="true">
            {avatar ? (
              // eslint-disable-next-line @next/next/no-img-element -- the staff member's Google profile photo
              <img src={avatar} alt="" referrerPolicy="no-referrer" />
            ) : (
              name.trim().charAt(0).toUpperCase()
            )}
          </span>
          <span className={styles.accountText}>
            <strong>{name}</strong>
            <span>{role}</span>
          </span>
          <Icon name="chevronDown" size={15} strokeWidth={2} />
        </button>
        {accountOpen && <div className={styles.accountMenu}>{menu}</div>}
      </div>
    </header>
  );
}
