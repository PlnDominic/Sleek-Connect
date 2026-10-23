import Link from 'next/link';
import { departmentIds, departmentLabels, formatPrice, type Category } from '@sleek/shared';
import { getCategories, getStoreInfo } from '@/lib/catalog';
import { BagButton } from './BagButton';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { SavedLink } from './SavedLink';
import { SearchBox } from './SearchBox';
import styles from './chrome.module.css';

export async function AnnouncementBar() {
  const { freeDeliveryThreshold } = await getStoreInfo();
  return (
    <div className={styles.announce}>
      {freeDeliveryThreshold !== undefined && (
        <span className={styles.announceItem}>
          <Icon name="truck" size={15} strokeWidth={2} />
          Free delivery in Accra on orders over {formatPrice(freeDeliveryThreshold)}
        </span>
      )}
      <span className={styles.announceItem}>
        <Icon name="shieldCheck" size={15} strokeWidth={2} />
        100% authentic, batch-checked products
      </span>
    </div>
  );
}

const navLinks = [
  { label: 'Home', href: '/' },
  { label: 'Shop', href: '/shop' },
  { label: 'New Arrivals', href: '/shop?sort=newest' },
  { label: 'Best Sellers', href: '/#best-sellers' },
  { label: 'Categories', href: '/shop', menu: true },
  { label: 'Shop by Age', href: '/shop-by-age' },
  { label: 'Gifts', href: '/search?q=gift' },
  { label: 'Contact', href: '/help#contact' },
];


/** The Categories menu: every department and its categories. */
function CategoriesMenu({ categories, current }: { categories: Category[]; current: boolean }) {
  return (
    <div className={styles.menu}>
      <Link href="/shop" aria-current={current ? 'page' : undefined} aria-haspopup="true">
        Categories
        <Icon name="chevronDown" size={14} strokeWidth={2} />
      </Link>
      <div className={styles.menuPanel}>
        {departmentIds.map((d) => (
          <div key={d} className={styles.menuColumn}>
            <Link href={`/shop/${d}`} className={styles.menuHeading}>
              {departmentLabels[d]}
            </Link>
            {categories
              .filter((c) => c.department === d)
              .map((c) => (
                <Link key={c.id} href={`/shop/${d}/${c.id}`}>
                  {c.name}
                </Link>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full header with the main navigation, used on the home page. */
export async function SiteHeader({ current }: { current?: string }) {
  const categories = await getCategories();
  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Logo />
        <nav aria-label="Main" className={styles.nav}>
          {navLinks.map((link) =>
            link.menu ? (
              <CategoriesMenu key={link.label} categories={categories} current={link.label === current} />
            ) : (
              <Link key={link.label} href={link.href} aria-current={link.label === current ? 'page' : undefined}>
                {link.label}
              </Link>
            ),
          )}
        </nav>
        <div className={styles.actions}>
          <Link href="/search" aria-label="Search" className={styles.iconButton}>
            <Icon name="search" size={21} />
          </Link>
          <SavedLink className={styles.wishlist} />
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
        <SearchBox compact />
        <BagButton variant="pill" />
      </div>
    </header>
  );
}
