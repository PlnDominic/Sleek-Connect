import Link from 'next/link';
import { departmentIds, departmentLabels, formatPrice, type Category, type Department } from '@sleek/shared';
import { getCategories, getStoreInfo } from '@/lib/catalog';
import { BagButton } from './BagButton';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { MobileMenu } from './MobileMenu';
import { SavedLink } from './SavedLink';
import { SearchBox } from './SearchBox';
import chrome from './chrome.module.css';
import styles from './header.module.css';

export async function AnnouncementBar() {
  const { freeDeliveryThreshold } = await getStoreInfo();
  return (
    <div className={chrome.announce}>
      {freeDeliveryThreshold !== undefined && (
        <span className={chrome.announceItem}>
          <Icon name="truck" size={15} strokeWidth={2} />
          Free delivery in Accra on orders over {formatPrice(freeDeliveryThreshold)}
        </span>
      )}
      <span className={chrome.announceItem}>
        <Icon name="shieldCheck" size={15} strokeWidth={2} />
        100% authentic, batch-checked products
      </span>
    </div>
  );
}

/** Links after the departments, on the right of the category bar and in the phone menu. */
const extraLinks = [
  { label: 'Shop by Age', href: '/shop-by-age' },
  { label: 'Contact', href: '/help#contact' },
];

/** One department in the category bar, with its categories in a dropdown. */
function DepartmentMenu({ id, categories, current }: { id: Department; categories: Category[]; current: boolean }) {
  const label = departmentLabels[id];
  return (
    <div className={styles.deptItem}>
      <Link href={`/shop/${id}`} className={styles.navLink} aria-current={current ? 'page' : undefined} aria-haspopup="true">
        {label}
        <Icon name="chevronDown" size={14} strokeWidth={2} />
      </Link>
      <div className={styles.panel}>
        <Link href={`/shop/${id}`} className={styles.panelAll}>
          Shop all {label}
          <Icon name="arrowRight" size={15} strokeWidth={2} />
        </Link>
        {categories.length > 0 && (
          <div className={styles.panelLinks} data-wide={categories.length > 5 ? 'true' : undefined}>
            {categories.map((c) => (
              <Link key={c.id} href={`/shop/${id}/${c.id}`}>
                {c.name}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The site header. Desktop: the logo, a search bar and the account, saved and bag links on top, with a category bar
 * underneath. Phones: one row with a menu button that opens a drawer. Stays at the top of the page as you scroll.
 */
export async function SiteHeader({ current }: { current?: string }) {
  const categories = await getCategories();
  const byDepartment = (d: Department) => categories.filter((c) => c.department === d);
  return (
    <header className={styles.header}>
      <div className={`container ${styles.top}`}>
        <MobileMenu
          departments={departmentIds.map((d) => ({
            id: d,
            label: departmentLabels[d],
            categories: byDepartment(d).map((c) => ({ id: c.id, name: c.name })),
          }))}
          links={extraLinks}
        />
        <Logo size={26} />
        <div className={styles.search}>
          <SearchBox compact />
        </div>
        <div className={styles.actions}>
          <Link href="/search" aria-label="Search" className={`${chrome.iconButton} ${styles.searchIcon}`}>
            <Icon name="search" size={21} />
          </Link>
          <SavedLink className={styles.saved} />
          <Link href="/account" aria-label="Account" className={styles.account}>
            <Icon name="user" size={21} />
            <span className={styles.accountLabel}>Account</span>
          </Link>
          <BagButton />
        </div>
      </div>
      <div className={styles.navBar}>
        <nav aria-label="Main" className={`container ${styles.nav}`}>
          <Link href="/shop" className={styles.navLink} aria-current={current === 'Shop' ? 'page' : undefined}>
            Shop All
          </Link>
          {departmentIds.map((d) => (
            <DepartmentMenu key={d} id={d} categories={byDepartment(d)} current={current === departmentLabels[d]} />
          ))}
          <span className={styles.navEnd}>
            {extraLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={styles.navLink}
                data-quiet="true"
                aria-current={link.label === current ? 'page' : undefined}
              >
                {link.label}
              </Link>
            ))}
          </span>
        </nav>
      </div>
    </header>
  );
}

/** Search-first header used on product pages. */
export function CompactHeader() {
  return (
    <header className={chrome.compact}>
      <div className={`container ${chrome.compactInner}`}>
        <Logo />
        <SearchBox compact />
        <BagButton />
      </div>
    </header>
  );
}
