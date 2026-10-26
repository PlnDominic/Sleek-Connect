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
  ['Apply', 'Sign in, tell us about your business and accept the vendor terms.'],
  ['Get approved', 'We review every application and call you on the number you give us.'],
  ['Pay the yearly fee', 'Your storefront opens as soon as we record your payment.'],
  ['List your products', 'Add photos, prices and stock. We review each product before it goes on sale.'],
] as const;

export default async function SellPage() {
  const terms = await getVendorTerms();
  return (
    <>
      <SiteHeader />
      <main className={styles.page}>
        <section className={`container ${styles.hero}`}>
          <div className={styles.heroText}>
            <p className={styles.kicker}>For vendors</p>
            <h1>Open your own store on Sleek Connect</h1>
            <p className={styles.lead}>
              A storefront with your name and logo, your products in our main shop and search, and shoppers across Accra. We
              handle the payments; you pack and hand over the orders.
            </p>
            <div className={styles.actions}>
              <Link href="/vendor" className={styles.primary}>
                Apply to sell <Icon name="arrowRight" size={16} strokeWidth={2} />
              </Link>
              <a href="#terms" className={styles.secondary}>
                Read the vendor terms
              </a>
            </div>
          </div>

          <aside className={styles.preview} aria-label="Preview of the vendor dashboard">
            <div className={styles.previewBar}>
              <span />
              <span />
              <span />
            </div>
            <div className={styles.previewBody}>
              <p className={styles.previewTitle}>Your dashboard</p>
              <div className={styles.previewStats}>
                <div>
                  <small>Products</small>
                  <strong>24</strong>
                </div>
                <div>
                  <small>On sale</small>
                  <strong>21</strong>
                </div>
              </div>
              <ul className={styles.previewList}>
                <li>
                  <span>Shea Body Butter</span>
                  <b>On sale</b>
                </li>
                <li>
                  <span>Black Soap Bar</span>
                  <b>On sale</b>
                </li>
                <li>
                  <span>Hair Growth Oil</span>
                  <em>Waiting for approval</em>
                </li>
              </ul>
            </div>
          </aside>
        </section>

        <section className={`container ${styles.section}`} aria-labelledby="how">
          <h2 id="how">How it works</h2>
          <ol className={styles.steps}>
            {steps.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={`container ${styles.split}`}>
          <div className={styles.card}>
            <h2>What it costs</h2>
            <p className={styles.price}>
              <strong>{formatPrice(terms.annualFee)}</strong>
              <span>per year</span>
            </p>
            <ul className={styles.ticks}>
              <li>Your own storefront page</li>
              <li>Listed in the shop and in search</li>
              <li>We collect payment from shoppers</li>
              <li>{terms.graceDays} days to renew before your store closes</li>
            </ul>
            <Link href="/vendor" className={styles.primary}>
              Apply to sell
            </Link>
          </div>

          <div id="terms" className={styles.card}>
            <h2>Vendor terms</h2>
            <ol className={styles.terms}>
              <li>You pay the yearly subscription to open and keep your store open. If it ends, your products come off sale until you renew.</li>
              <li>You set the price you want to receive. We review each product and add a markup; shoppers pay the total. You are paid your own price for each unit sold.</li>
              <li>We collect the payment. You must pack and hand over every paid order on time.</li>
              <li>You sell only genuine, legal products you have the right to sell, with honest descriptions, safety notes and the registrations the law requires (for example FDA registration for cosmetics).</li>
              <li>We may decline or remove a product, or suspend a store, that breaks these terms or puts shoppers at risk.</li>
              <li>We keep your contact details private and use them only to run your account.</li>
            </ol>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
