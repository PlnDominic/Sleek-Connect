import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatPrice } from '@sleek/shared';
import { getVendorTerms } from '@/lib/catalog';
import styles from './vendor.module.css';

/** The opening pages (signed out, and the application itself): the main column, and how selling works beside it. */
export async function Onboarding({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const terms = await getVendorTerms().catch(() => null);
  const steps = [
    ['Apply', 'Your store name, your details and a photo of your ID. About five minutes.'],
    ['We check and call you', 'We confirm your ID and phone number, usually within a day or two.'],
    ['Set up while you wait', 'Add your logo, banner and story, then prepare your products.'],
    ['Open your store', terms ? `Pay the yearly fee of ${formatPrice(terms.annualFee)} and your approved products go on sale.` : 'Pay the yearly fee and your approved products go on sale.'],
  ] as const;
  return (
    <div className={styles.onboard}>
      <div className={styles.onboardMain}>
        <p className={styles.onboardKicker}>Sell on Sleek Connect</p>
        <h1 className={styles.onboardTitle}>{title}</h1>
        <p className={styles.onboardLead}>{lead}</p>
        <div className={styles.onboardCard}>{children}</div>
      </div>
      <aside className={styles.onboardAside} aria-label="How selling works">
        <h2>How it works</h2>
        <ol className={styles.journey}>
          {steps.map(([name, text], i) => (
            <li key={name}>
              <span aria-hidden="true">{i + 1}</span>
              <div>
                <strong>{name}</strong>
                <p>{text}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className={styles.needs}>
          <h3>Have these ready</h3>
          <ul>
            <li>A Ghana Card, passport, voter’s ID or driver’s licence</li>
            <li>A phone number we can call</li>
            <li>A Mobile Money number for your earnings</li>
            <li>Your TIN (for an individual, the Ghana Card number)</li>
          </ul>
        </div>
        <p className={styles.muted}>
          We deliver every order for you. <Link href="/sell">Read how selling works</Link>
        </p>
      </aside>
    </div>
  );
}

