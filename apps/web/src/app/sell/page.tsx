import type { Metadata } from 'next';
import Link from 'next/link';
import { formatPrice } from '@sleek/shared';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getVendorTerms } from '@/lib/catalog';
import styles from './sell.module.css';

export const metadata: Metadata = {
  title: 'Sell on Sleek Connect',
  description: 'Open your own storefront on Sleek Connect Store and reach shoppers across Accra.',
  alternates: { canonical: '/sell' },
};

export default async function SellPage() {
  const terms = await getVendorTerms();
  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.hero}>
          <div className="container">
            <h1>Open your own store on Sleek Connect</h1>
            <p>
              Get a branded storefront, show your products in our main shop and search, and sell to shoppers across Accra. We take the
              payments; you pack and hand over the orders.
            </p>
            <div className={styles.actions}>
              <Link href="/vendor" className={styles.primary}>
                Apply to sell
              </Link>
              <a href="#terms" className={styles.secondary}>
                Read the vendor terms
              </a>
            </div>
          </div>
        </section>

        <section className={`container ${styles.section}`}>
          <h2>How it works</h2>
          <ol className={styles.steps}>
            <li>
              <strong>Apply</strong>
              <span>Sign in, tell us about your business and accept the vendor terms.</span>
            </li>
            <li>
              <strong>Get approved</strong>
              <span>We look at every application and get in touch on the phone number you give us.</span>
            </li>
            <li>
              <strong>Pay the yearly fee</strong>
              <span>Your storefront opens as soon as we record your payment.</span>
            </li>
            <li>
              <strong>List your products</strong>
              <span>Add photos, prices and stock. We review each product before it goes on sale.</span>
            </li>
          </ol>
        </section>

        <section className={`container ${styles.section}`}>
          <h2>What it costs</h2>
          <p className={styles.price}>
            <strong>{formatPrice(terms.annualFee)}</strong>
            <span>per year, paid to Sleek Connect</span>
          </p>
        </section>

        <section id="terms" className={`container ${styles.section}`}>
          <h2>Vendor terms</h2>
          <ol className={styles.terms}>
            <li>You pay the yearly subscription to open your store and to keep it open. If it ends, your products come off sale until you renew ({terms.graceDays} days of grace are included).</li>
            <li>You set the price you want to receive. Sleek Connect reviews each product and adds a markup, and shoppers pay the total. You are paid your own price for each unit sold.</li>
            <li>Sleek Connect collects the payment from shoppers. You must pack and hand over every paid order on time.</li>
            <li>You sell only genuine, legal products that you have the right to sell, with honest descriptions, safety notes and the registration numbers the law requires (for example FDA registration for cosmetics).</li>
            <li>We may decline or remove a product, or suspend a store, that breaks these terms or puts shoppers at risk.</li>
            <li>We keep your contact details private and use them only to run your account.</li>
          </ol>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
