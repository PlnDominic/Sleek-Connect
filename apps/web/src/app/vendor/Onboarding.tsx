import type { ReactNode } from 'react';
import styles from './vendor.module.css';

/** The opening pages (signed out, and the application itself): a heading and one centred card. */
export function Onboarding({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <div className={styles.onboard}>
      <div className={styles.onboardMain}>
        <p className={styles.onboardKicker}>Sell on Sleek Connect</p>
        <h1 className={styles.onboardTitle}>{title}</h1>
        <p className={styles.onboardLead}>{lead}</p>
        <div className={styles.onboardCard}>{children}</div>
      </div>
    </div>
  );
}
