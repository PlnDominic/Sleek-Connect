import Link from 'next/link';
import { paymentMethodsLine } from '@sleek/shared';
import { Logo } from './Logo';
import styles from './chrome.module.css';

const columns = [
  { title: 'Shop', links: ['Beauty', 'Baby & Kids', 'Shop by Age', 'Gifts'] },
  { title: 'Help', links: ['Track an order', 'Returns and refunds', 'Delivery areas', 'Contact support'] },
  { title: 'Trust', links: ['Authenticity promise', 'Product safety', 'Privacy policy', 'Terms of service'] },
];

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.footerTop}`}>
        <div className={styles.footerBrand}>
          <Logo size={22} onDark />
          <span className={styles.footerBlurb}>
            Authentic beauty and safe, age-appropriate products for little ones, delivered across Accra.
          </span>
          <span className={styles.footerPayments}>{paymentMethodsLine}</span>
        </div>
        {columns.map((col) => (
          <nav key={col.title} aria-label={col.title} className={styles.footerCol}>
            <strong>{col.title}</strong>
            {col.links.map((label) => (
              // Help, policy and listing pages are not designed yet.
              <Link key={label} href="#">
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className={styles.footerBottom}>
        <div className={`container ${styles.footerBottomInner}`}>
          <span>© 2026 Sleek Connect. All rights reserved.</span>
          <span>
            Developed by:{' '}
            <a href="https://www.ecstasytechnologies.com" target="_blank" rel="noopener">
              Ecstasy Technologies
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}
