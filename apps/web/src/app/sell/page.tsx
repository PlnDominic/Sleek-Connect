import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getVendorAccountsOpen, getVendorTerms } from '@/lib/catalog';
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

const supplySteps = [
  ['Get in touch', 'Tell us what you make or source.'],
  ['Agree the products', 'We check each product and agree your price.'],
  ['Supply the stock', 'You deliver it to us, or we collect it.'],
  ['We sell and pay you', 'We sell to shoppers, deliver, and pay you for what was delivered.'],
] as const;

export default async function SellPage() {
  const [terms, accountsOpen] = await Promise.all([getVendorTerms(), getVendorAccountsOpen()]);
  if (!accountsOpen) {
    return (
      <>
        <SiteHeader />
        <main className={styles.page}>
          <section className={`container ${styles.hero}`}>
            <p className={styles.kicker}>For makers and brands</p>
            <h1>Supply products to Sleek Connect</h1>
            <p className={styles.lead}>
              Make or source beauty, baby, home or fashion products? We buy from suppliers, sell to shoppers across Accra, and deliver. You don’t need to run a shop.
            </p>
            <Link href="/help#contact" className={styles.primary}>
              Get in touch <Icon name="arrowRight" size={16} strokeWidth={2} />
            </Link>
          </section>

          <section className={`container ${styles.grid}`} aria-label="How supplying works">
            {supplySteps.map(([title, text], i) => (
              <div key={title} className={styles.card}>
                <span className={styles.num}>{i + 1}</span>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            ))}
            <details id="terms" className={`${styles.card} ${styles.termsCard}`}>
              <summary>How we work with suppliers</summary>
              <ol>
                <li>You must be 18 or older, and the owner of the business or authorised to act for it.</li>
                <li>We agree a price for each product. We buy at that price and set the shopper price ourselves.</li>
                <li>We pay you for goods that have been delivered to shoppers, {terms.payoutHoldDays} days after delivery, to your Mobile Money number.</li>
                <li>We need your tax details (TIN) before the first payment.</li>
                <li>Supply only genuine, legal products with honest descriptions and the registrations the law requires.</li>
                <li>We may stop buying a product, for example after a safety concern.</li>
              </ol>
            </details>
          </section>
        </main>
        <SiteFooter />
      </>
    );
  }
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
            <span>Open your store for</span>
            <strong>GH₵{(terms.annualFee / 365).toFixed(2)} a day</strong>
            <span>Billed once a year: {formatPrice(terms.annualFee)}</span>
          </div>
          <details id="terms" className={`${styles.card} ${styles.termsCard}`}>
            <summary>Vendor terms</summary>
            <ol>
              <li>You must be 18 or older, and the owner of the store or authorised to act for its owner.</li>
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
