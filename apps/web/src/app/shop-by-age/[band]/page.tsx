import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { SiteFooter } from '@/components/SiteFooter';
import { AnnouncementBar, SiteHeader } from '@/components/SiteHeader';
import { getAgeBandProducts, getAgeBands } from '@/lib/catalog';
import { defaultShareImage } from '@/lib/site';
import { AgeBandProducts } from './AgeBandProducts';
import styles from './shop-by-age.module.css';

export async function generateStaticParams() {
  return (await getAgeBands()).map((band) => ({ band: band.id }));
}

export async function generateMetadata({ params }: PageProps<'/shop-by-age/[band]'>): Promise<Metadata> {
  const { band } = await params;
  const current = (await getAgeBands()).find((b) => b.id === band);
  if (!current) return {};
  const title = `Shop by age: ${current.label} (${current.stage})`;
  return { title, alternates: { canonical: `/shop-by-age/${current.id}` }, openGraph: { title, url: `/shop-by-age/${current.id}`, images: [defaultShareImage] }, twitter: { card: 'summary_large_image', images: [defaultShareImage.url] } };
}

export default async function ShopByAgePage({ params }: PageProps<'/shop-by-age/[band]'>) {
  const { band } = await params;
  const bands = await getAgeBands();
  const current = bands.find((b) => b.id === band);
  if (!current) notFound();
  const products = await getAgeBandProducts(current.id);

  return (
    <>
      <AnnouncementBar />
      <SiteHeader current="Shop by Age" />
      <main>
        <section className={styles.hero}>
          <div className={`container ${styles.heroInner}`}>
            <div className={styles.heading}>
              <h1>Shop by age</h1>
              <p>Pick an age to see products chosen to be safe and suitable for it.</p>
            </div>
            <nav aria-label="Age band" className={styles.bands}>
              {bands.map((b) => (
                <Link
                  key={b.id}
                  href={`/shop-by-age/${b.id}`}
                  aria-current={b.id === current.id ? 'page' : undefined}
                  className={styles.band}
                  scroll={false}
                >
                  <strong>{b.label}</strong>
                  <span>{b.stage}</span>
                </Link>
              ))}
            </nav>
            <p className={styles.privacy}>
              <Icon name="lock" size={14} strokeWidth={2} />
              Just a filter. We never store your child&apos;s details.
            </p>
          </div>
        </section>
        <section className={`container ${styles.results}`} aria-labelledby="results-title">
          <AgeBandProducts products={products} bandLabel={current.label} />
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
