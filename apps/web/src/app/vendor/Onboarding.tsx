import type { ReactNode } from 'react';
import { getVendorTerms } from '@/lib/catalog';
import { dailyFee } from '@/lib/subscription-price';
import styles from './vendor.module.css';

/** The opening pages (signed out, and the application itself): a heading and one centred card. */
export async function Onboarding({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  const terms = await getVendorTerms().catch(() => null);
  return (
    <div className={styles.onboard}>
      <div className={styles.onboardMain}>
        <p className={styles.onboardKicker}>Sell on Sleek Connect</p>
        <h1 className={styles.onboardTitle}>{title}</h1>
        <p className={styles.onboardLead}>{lead}</p>
        {terms && (
          <p className={styles.priceTag}>
            <strong>GH₵{dailyFee(terms.annualFee)} a day</strong>
            <span>to run your store. Billed once a year at GH₵{terms.annualFee}, only after we approve you.</span>
          </p>
        )}
        <div className={styles.onboardCard}>{children}</div>
      </div>
    </div>
  );
}
