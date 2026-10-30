import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { Logo } from '@/components/Logo';
import { SiteFooter } from '@/components/SiteFooter';
import { getDeliveryConfig } from '@/lib/catalog';
import { CheckoutForm } from './CheckoutForm';
import styles from './checkout.module.css';

export const metadata: Metadata = {
  title: 'Checkout',
};

export default async function CheckoutPage() {
  const delivery = await getDeliveryConfig();

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Logo size={22} />
          <ol aria-label="Checkout steps" className={styles.steps}>
            <li className={styles.stepDone}>
              <Link href="/bag" className={styles.stepLink}>
                <span className={styles.stepMark}>✓</span>Bag
              </Link>
            </li>
            <li aria-hidden="true" className={styles.stepSep}>
              ›
            </li>
            <li aria-current="step" className={styles.stepCurrent}>
              <span className={styles.stepMark}>2</span>Delivery &amp; payment
            </li>
            <li aria-hidden="true" className={styles.stepSep}>
              ›
            </li>
            <li className={styles.stepTodo}>
              <span className={styles.stepMark}>3</span>Confirmation
            </li>
          </ol>
          <span className={styles.secure}>
            <Icon name="lock" size={16} strokeWidth={2} />
            Secure checkout
          </span>
        </div>
      </header>
      <CheckoutForm delivery={delivery} />
      <SiteFooter />
    </div>
  );
}
