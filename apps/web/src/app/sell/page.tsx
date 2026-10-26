import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getVendorTerms } from '@/lib/catalog';
import styles from './sell.module.css';

export const metadata: Metadata = {
  title: 'Sell on Sleek Connect',
  description: 'Open your own storefront on Sleek Connect Store and reach shoppers across Accra.',
  alternates: { canonical: '/sell' },
};

const steps = [
  ['Apply', 'Tell us about your business.'],
  ['Get approved', 'We review and call you.'],
  ['Pay the yearly fee', 'Your store opens.'],
  ['List products', 'We approve each one.'],
] as const;

export default async function SellPage() {
  const terms = await getVendorTerms();
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <section className={`container ${styles.hero}`}>
          <p className={styles.kicker}>For vendors</p>
          <h1>Open your own store on Sleek Connect</h1>
          <p className={styles.lead}>Your products in our shop. We take the payments, you pack the orders.</p>
          <Link href="/vendor" className={styles.primary}>
            Apply to sell <Icon name="arrowRight" size={16} strokeWidth={2} />
          </Link>
        </section>

        <section className={`container ${styles.grid}`} aria-label="How it works and cost">
          {steps.map(([title, text], i) => (
            <div key={title} className={styles.card}>
              <span className={styles.num}>{i + 1}</span>
              <strong>{title}</strong>
              <span>{text}</span>
            </div>
          ))}
          <div className={`${styles.card} ${styles.priceCard}`}>
            <span>Yearly fee</span>
            <strong>{formatPrice(terms.annualFee)}</strong>
          </div>
          <details id="terms" className={`${styles.card} ${styles.termsCard}`}>
            <summary>Vendor terms</summary>
            <ol>
              <li>Pay the yearly fee to open and keep your store open.</li>
              <li>You set your price; we add a markup. You are paid your own price.</li>
              <li>You pack and hand over every paid order on time.</li>
              <li>Sell only genuine, legal products with honest descriptions.</li>
              <li>We may remove products or suspend stores that break these terms.</li>
            </ol>
          </details>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
