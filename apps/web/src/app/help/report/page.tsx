import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getCustomerOrder } from '../../orders/[token]/data';
import { ReportForm, type ReportDefaults } from './ReportForm';
import { topics, type Topic } from './topics';
import styles from '../help.module.css';

export const metadata: Metadata = { title: 'Report a problem', robots: { index: false, follow: true } };

export default function ReportPage({ searchParams }: PageProps<'/help/report'>) {
  return (
    <>
      <SiteHeader current="Contact" />
      <main>
        <div className={styles.hero}>
          <div className="container">
            <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
              <Link href="/help">Help centre</Link>
              <span aria-hidden="true">/</span>
              <span aria-current="page">Report a problem</span>
            </nav>
            <h1>Report a problem</h1>
            <p>
              Tell us what’s wrong and we’ll get back to you. You’ll get a case number straight away. To send back an
              item from a delivered order, use <strong>Request a return</strong> on your order page instead.
            </p>
          </div>
        </div>
        <div className={`container ${styles.main} ${styles.narrow}`}>
          <Suspense fallback={null}>
            <Report searchParams={searchParams} />
          </Suspense>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<'/help/report'>['searchParams'] }) {
  const params = await searchParams;
  const token = typeof params.order === 'string' ? params.order : undefined;
  const topic = typeof params.topic === 'string' && params.topic in topics ? (params.topic as Topic) : undefined;
  const order = token ? await getCustomerOrder(token) : null;
  const defaults: ReportDefaults = order
    ? { token, orderNumber: order.order_number, name: order.customer_name, phone: order.phone, topic }
    : { topic };
  return <ReportForm defaults={defaults} />;
}
