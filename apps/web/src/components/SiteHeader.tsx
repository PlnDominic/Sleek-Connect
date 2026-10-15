import Link from 'next/link';
import { pending } from '@sleek/shared';
import { BagButton } from './BagButton';
import { Icon } from './Icon';
import { Logo } from './Logo';
import styles from './chrome.module.css';

export function AnnouncementBar() {
  return (
    <div className={styles.announce}>
      <span className={styles.announceItem}>
        <Icon name="truck" size={15} strokeWidth={2} />
        Free delivery in Accra on orders over GH₵ {pending.freeDeliveryThreshold}
      </span>
      <span className={styles.announceItem}>
        <span className={styles.star}>
          <Icon name="star" size={15} />
        </span>
        Weekend Glow Sale: up to {pending.saleMaxPercent}% off skincare
      </span>
      <span className={styles.announceItem}>
        <Icon name="shieldCheck" size={15} strokeWidth={2} />
        100% authentic, batch-checked products
      </span>
    </div>
  );
}

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/#new-arrivals' },
  { label: 'New Arrivals', href: '/#new-arrivals' },
  { label: 'Best Sellers', href: '/#best-sellers' },
  { label: 'Categories', href: '/#categories', menu: true },
  { label: 'Shop by Age', href: '/shop-by-age' },
  { label: 'Gifts', href: '#' },
  { label: 'Contact', href: '#' },
];

/** Full header with the main navigation, used on the home page. */
export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Logo />
        <nav aria-label="Main" className={styles.nav}>
          {navLinks.map((link) => (
            <Link key={link.label} href={link.href} aria-current={link.label === current ? 'page' : undefined}>
              {link.label}
              {link.menu && <Icon name="chevronDown" size={14} strokeWidth={2} />}
            </Link>
          ))}
        </nav>
        <div className={styles.actions}>
          <button type="button" aria-label="Search" className={styles.iconButton}>
            <Icon name="search" size={21} />
          </button>
          <button type="button" aria-label="Saved items" className={styles.iconButton}>
            <Icon name="heart" size={21} />
          </button>
          <Link href="/account" aria-label="Account" className={styles.iconButton}>
            <Icon name="user" size={21} />
          </Link>
          <BagButton variant="icon" />
        </div>
      </div>
    </header>
  );
}

/** Search-first header used on product pages. */
export function CompactHeader() {
  return (
    <header className={styles.compact}>
      <div className={`container ${styles.compactInner}`}>
        <Logo />
        <form role="search" className={styles.search}>
          <label htmlFor="site-search">
            <Icon name="search" size={18} strokeWidth={2} />
            <span className="visually-hidden">Search products</span>
          </label>
          <input id="site-search" name="q" type="search" placeholder="Search serums, baby wash, gift sets..." />
        </form>
        <BagButton variant="pill" />
      </div>
    </header>
  );
}
