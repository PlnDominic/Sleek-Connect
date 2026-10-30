import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { Stars } from '@/components/Stars';
import { getStoreDirectory } from '@/lib/catalog';
import styles from './stores.module.css';

export const metadata: Metadata = {
  title: 'Stores',
  description: 'Shop from the independent stores that sell on Sleek Connect Store.',
  alternates: { canonical: '/stores' },
};

export default async function StoresPage() {
  const stores = await getStoreDirectory();
  return (
    <>
      <SiteHeader />
      <main className={`container ${styles.page}`}>
        <h1>Stores</h1>
        <p className={styles.lead}>Independent sellers on Sleek Connect Store. We check every product and deliver every order.</p>
        {stores.length === 0 ? (
          <p className={styles.empty}>
            No vendor stores are open yet. <Link href="/shop">Browse the shop</Link> or <Link href="/sell">open your own store</Link>.
          </p>
        ) : (
          <ul className={styles.grid}>
            {stores.map((s) => (
              <li key={s.slug}>
                <Link href={`/store/${s.slug}`} className={styles.card}>
                  <span className={styles.banner}>{s.banner && <Image src={s.banner} alt="" fill sizes="(max-width: 600px) 100vw, 320px" />}</span>
                  {s.logo ? (
                    <Image src={s.logo} alt="" width={56} height={56} className={styles.logo} />
                  ) : (
                    <span className={styles.initial} aria-hidden="true">
                      {s.name.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                  <strong>{s.name}</strong>
                  {s.tagline && <span className={styles.tagline}>{s.tagline}</span>}
                  <span className={styles.meta}>
                    {s.productCount} product{s.productCount === 1 ? '' : 's'}
                    {s.reviewCount > 0 && (
                      <>
                        {' · '}
                        <Stars rating={s.rating} /> {s.rating.toFixed(1)}
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
