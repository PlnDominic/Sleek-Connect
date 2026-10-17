import Link from 'next/link';
import { paymentMethodsLine } from '@sleek/shared';
import { Logo } from './Logo';
import styles from './chrome.module.css';

// The privacy policy and terms of service aren't written yet, so they still link to '#'.
const columns = [
  {
    title: 'Shop',
    links: [
      { label: 'Beauty', href: '/shop/beauty' },
      { label: 'Baby & Kids', href: '/shop/kids' },
      { label: 'Shop by Age', href: '/shop-by-age' },
      { label: 'Gifts', href: '/search?q=gift' },
    ],
  },
  {
    title: 'Help',
    links: [
      { label: 'Track an order', href: '/track' },
      { label: 'Returns and refunds', href: '/help#returns' },
      { label: 'Delivery areas', href: '/help#delivery' },
      { label: 'Contact support', href: '/help#contact' },
    ],
  },
  {
    title: 'Trust',
    links: [
      { label: 'Authenticity promise', href: '/help#authenticity' },
      { label: 'Product safety', href: '/help#safety' },
      { label: 'Privacy policy', href: '#' },
      { label: 'Terms of service', href: '#' },
    ],
  },
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
            {col.links.map((link) => (
              <Link key={link.label} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        ))}
      </div>
      <div className={styles.footerBottom}>
        <div className={`container ${styles.footerBottomInner}`}>
          <span>© 2026 Sleek Connect Store. All rights reserved.</span>
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
