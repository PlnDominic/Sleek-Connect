import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductCard } from '@/components/ProductCard';
import { SiteFooter } from '@/components/SiteFooter';
import { SiteHeader } from '@/components/SiteHeader';
import { getStorefront, getStoreSlugs } from '@/lib/catalog';
import styles from './store.module.css';

export async function generateStaticParams() {
  // Our own store always exists, so there is always at least one page to build; other stores are built on first visit.
  return (await getStoreSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<'/store/[slug]'>): Promise<Metadata> {
  const store = await getStorefront((await params).slug);
  if (!store) return {};
  const description = store.tagline ?? `Shop ${store.name} on Sleek Connect Store.`;
  return {
    title: store.name,
    description,
    alternates: { canonical: `/store/${store.slug}` },
    openGraph: { title: store.name, description, url: `/store/${store.slug}` },
  };
}

export default async function StorePage({ params }: PageProps<'/store/[slug]'>) {
  const store = await getStorefront((await params).slug);
  if (!store) notFound();

  return (
    <>
      <SiteHeader />
      <main>
        <section className={styles.hero}>
          {store.banner && <Image src={store.banner} alt="" fill sizes="100vw" className={styles.banner} priority />}
          <div className={`container ${styles.heroInner}`}>
            {store.logo ? (
              <Image src={store.logo} alt="" width={88} height={88} className={styles.logo} />
            ) : (
              <span className={styles.initial} aria-hidden="true">
                {store.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <p className={styles.kicker}>{store.isHouse ? 'Our own range' : 'Vendor store'}</p>
              <h1>{store.name}</h1>
              {store.tagline && <p className={styles.tagline}>{store.tagline}</p>}
            </div>
          </div>
        </section>

        <div className={`container ${styles.body}`}>
          {store.description && <p className={styles.about}>{store.description}</p>}
          <h2 className={styles.count}>
            {store.products.length} {store.products.length === 1 ? 'product' : 'products'}
          </h2>
          {store.products.length === 0 ? (
            <p className={styles.empty}>
              Nothing is on sale here yet. <Link href="/shop">Browse the shop</Link>.
            </p>
          ) : (
            <div className={styles.grid}>
              {store.products.map((p) => (
                <ProductCard key={p.slug} product={p} />
              ))}
            </div>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
