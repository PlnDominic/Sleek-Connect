import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { city, defaultDeliveryArea, departmentLabels, formatPrice } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { JsonLd } from '@/components/JsonLd';
import { ProductImage } from '@/components/ProductImage';
import { SaveButton } from '@/components/SaveButton';
import { Stars } from '@/components/Stars';
import { SiteFooter } from '@/components/SiteFooter';
import { CompactHeader } from '@/components/SiteHeader';
import { getDeliveryConfig, getProduct, getRelatedProducts, getStoreInfo, listProductSlugs } from '@/lib/catalog';
import { estimate } from '@/lib/delivery';
import { getProductQuestions, getProductReviews } from '@/lib/reviews';
import { defaultShareImage, siteName, siteUrl } from '@/lib/site';
import { ProductGallery } from './ProductGallery';
import { ProductInfoTabs } from './ProductInfoTabs';
import { ProductReviews } from './ProductReviews';
import { ProductQuestions } from './ProductQuestions';
import { RecentProducts } from './RecentProducts';
import { PurchasePanel } from './PurchasePanel';
import { RestockAlert } from './RestockAlert';
import styles from './product.module.css';

export async function generateStaticParams() {
  return (await listProductSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const description = product.details?.description ?? product.summary;
  const photos = product.photos?.slice(0, 4).map((p) => ({ url: p.url, alt: p.alt ?? product.name }));
  return {
    title: product.name,
    description,
    alternates: { canonical: `/products/${product.slug}` },
    // Without a photo of its own the page falls back to the store's share picture.
    openGraph: { title: product.name, description, url: `/products/${product.slug}`, images: photos?.length ? photos : [defaultShareImage] },
    twitter: { card: 'summary_large_image', title: product.name, description, images: photos?.length ? photos.map((p) => p.url) : [defaultShareImage.url] },
  };
}

export default async function ProductPage({ params, searchParams }: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const query = await searchParams;
  const reviewPage = Math.max(1, Number(query.reviews) || 1);
  const minRating = Math.min(5, Math.max(0, Number(query.rating) || 0));
  const [product, related, store, delivery, { summary, reviews }, questions] = await Promise.all([
    getProduct(slug),
    getRelatedProducts(slug),
    getStoreInfo(),
    getDeliveryConfig(),
    getProductReviews(slug, reviewPage, minRating),
    getProductQuestions(slug),
  ]);
  if (!product) notFound();

  const details = product.details;
  const highlights = details?.highlights ?? [product.tag];
  const base = siteUrl();
  const url = `${base}/products/${product.slug}`;
  const prices = (product.sizes?.length ? product.sizes.map((s) => s.price) : [product.price]).filter((n) => Number.isFinite(n));
  const availability =
    product.inStock === undefined ? undefined : `https://schema.org/${product.inStock ? 'InStock' : 'OutOfStock'}`;
  const offer = {
    priceCurrency: 'GHS',
    ...(availability && { availability }),
    itemCondition: 'https://schema.org/NewCondition',
    url,
    seller: { '@type': 'Organization', name: siteName },
  };
  const productData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: details?.description ?? product.summary,
    sku: product.slug,
    url,
    ...(product.brand && { brand: { '@type': 'Brand', name: product.brand } }),
    ...(product.photos?.length && { image: product.photos.map((p) => p.url) }),
    ...(summary.count > 0 && {
      aggregateRating: { '@type': 'AggregateRating', ratingValue: summary.average.toFixed(1), reviewCount: summary.count, bestRating: 5, worstRating: 1 },
      review: reviews.slice(0, 5).map((r) => ({
        '@type': 'Review',
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
        author: { '@type': 'Person', name: r.displayName },
        datePublished: r.createdAt.slice(0, 10),
        ...(r.title && { name: r.title }),
        reviewBody: r.body,
      })),
    }),
    offers:
      new Set(prices).size > 1
        ? { '@type': 'AggregateOffer', ...offer, lowPrice: Math.min(...prices).toFixed(2), highPrice: Math.max(...prices).toFixed(2), offerCount: prices.length }
        : { '@type': 'Offer', ...offer, price: (prices[0] ?? product.price).toFixed(2) },
  };
  const crumbs = [
    { name: 'Home', path: '' },
    { name: departmentLabels[product.department], path: `/shop/${product.department}` },
    ...(product.collection
      ? [{ name: product.collection, path: product.category ? `/shop/${product.department}/${product.category}` : `/shop/${product.department}` }]
      : []),
    { name: product.name, path: `/products/${product.slug}` },
  ];
  const breadcrumbData = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: `${base}${c.path}` })),
  };

  return (
    <>
      <JsonLd data={productData} />
      <JsonLd data={breadcrumbData} />
      <CompactHeader />
      <nav aria-label="Breadcrumb" className={`container ${styles.breadcrumb}`}>
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href={`/shop/${product.department}`}>{departmentLabels[product.department]}</Link>
        {product.collection && (
          <>
            <span aria-hidden="true">/</span>
            <Link href={product.category ? `/shop/${product.department}/${product.category}` : `/shop/${product.department}`}>
              {product.collection}
            </Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        <span aria-current="page" className={styles.breadcrumbCurrent}>
          {product.name}
        </span>
      </nav>

      <main className={`container ${styles.main}`}>
        <ProductGallery product={product} />

        <div className={styles.info}>
          <div className={styles.titleBlock}>
            <div className={styles.titleTop}>
              {product.brand && <span className={styles.brand}>{product.brand}</span>}
              <SaveButton slug={product.slug} name={product.name} className={styles.save} withLabel />
            </div>
            <h1 className={styles.title}>{product.name}</h1>
            {summary.count > 0 && (
              <a href="#reviews" className={styles.ratingLink}>
                <Stars rating={summary.average} /> {summary.average.toFixed(1)} ({summary.count} {summary.count === 1 ? 'review' : 'reviews'})
              </a>
            )}
            <p className={styles.description}>{details?.description ?? product.summary}</p>
          </div>

          <div className={styles.chips}>
            <span className={styles.chip}>
              <Icon name="shieldCheck" size={14} strokeWidth={2.2} />
              Verified authentic
            </span>
            {highlights.map((h) => (
              <span key={h} className={styles.chip}>
                {h}
              </span>
            ))}
          </div>

          <PurchasePanel product={product} />
          {product.inStock === false && <RestockAlert slug={product.slug} />}

          <div className={styles.serviceBox}>
            <div className={styles.serviceRow}>
              <Icon name="truck" size={22} />
              <span>
                <strong>
                  Delivery to {defaultDeliveryArea}, {city}
                </strong>{' '}
                <Link href="/help#delivery" className={styles.serviceLink}>
                  Delivery areas
                </Link>
                <br />
                <span className={styles.muted}>
                  {delivery.options
                    .map((o) => `${o.label}: ${estimate(o).replace(/^./, (c) => c.toLowerCase())}`)
                    .join('. ')}
                  . Tracked from packing to door.
                </span>
              </span>
            </div>
            <div className={styles.serviceRow}>
              <Icon name="refresh" size={22} />
              <span>
                <strong>Returns</strong>{' '}
                <Link href="/help#returns" className={styles.serviceLink}>
                  How returns work
                </Link>
                <br />
                <span className={styles.muted}>
                  {product.returnable === false
                    ? `Can’t be returned once delivered, unless it arrives damaged, wrong or expired (tell us within ${store.returnWindowDays} days).`
                    : `Unopened and sealed within ${store.returnWindowDays} days of delivery.`}{' '}
                  {product.returnNote && <>{product.returnNote} </>}
                  Damaged or not genuine: full refund to your MoMo wallet or card.
                </span>
              </span>
            </div>
          </div>
        </div>
      </main>

      <section className={`container ${styles.tabsSection}`}>
        <ProductInfoTabs product={product} />
      </section>

      <ProductReviews slug={product.slug} summary={summary} reviews={reviews} page={reviewPage} minRating={minRating} />
      <ProductQuestions slug={product.slug} questions={questions} />

      <section className={`container ${styles.relatedSection}`}>
        <h2 className={styles.relatedTitle}>You may also like</h2>
        <div className={styles.relatedGrid}>
          {related.map((r) => (
            <Link key={r.slug} href={`/products/${r.slug}`} className={styles.relatedCard}>
              <ProductImage
                image={r.image}
                photo={r.photos?.[0]?.url}
                tint={r.tint}
                kind={r.kind}
                alt={r.name}
                sizes="(max-width: 600px) 50vw, 300px"
                className={styles.relatedImage}
              />
              <span className={styles.relatedTag}>{r.tag.split(' · ')[0]}</span>
              <strong className={styles.relatedName}>{r.name}</strong>
              <span className={styles.relatedPrice}>{formatPrice(r.price)}</span>
            </Link>
          ))}
        </div>
      </section>
      <RecentProducts current={product} />
      <SiteFooter />
    </>
  );
}
