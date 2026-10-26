import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { RecentOrders } from './RecentOrders';
import { TrackForm } from './TrackForm';
import styles from '../help/help.module.css';

export const metadata: Metadata = {
  title: 'Track an order',
  description: 'Find your order with its order number and the phone number used at checkout.',
};

export default function TrackPage() {
  return (
    <>
      <SiteHeader />
      <main>
        <div className={styles.hero}>
          <div className="container">
            <h1>Track an order</h1>
            <p>Enter your order number and the phone number you used at checkout to see where your order is.</p>
          </div>
        </div>
        <div className={`container ${styles.main}`}>
          <section className={`${styles.panel} ${styles.narrow}`}>
            <TrackForm />
          </section>
          <div className={styles.narrow}>
            <RecentOrders />
          </div>
          <p className={styles.muted}>
            Signed in? Your orders are under <Link href="/account/orders">My orders</Link>. Need a hand?{' '}
            <Link href="/help#contact">Contact us</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
