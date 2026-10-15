import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { city, defaultDeliveryArea, departmentLabels, formatPrice, pending } from '@sleek/shared';
import { Icon } from '@/components/Icon';
import { ProductImage } from '@/components/ProductImage';
import { SiteFooter } from '@/components/SiteFooter';
import { CompactHeader } from '@/components/SiteHeader';
import { getProduct, getRelatedProducts, listProductSlugs } from '@/lib/catalog';
import { ProductGallery } from './ProductGallery';
import { ProductInfoTabs } from './ProductInfoTabs';
import { PurchasePanel } from './PurchasePanel';
import styles from './product.module.css';

export async function generateStaticParams() {
  return (await listProductSlugs()).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<'/products/[slug]'>): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  return product ? { title: product.name, description: product.details?.description ?? product.summary } : {};
}

export default async function ProductPage({ params }: PageProps<'/products/[slug]'>) {
  const { slug } = await params;
  const [product, related] = await Promise.all([getProduct(slug), getRelatedProducts(slug)]);
  if (!product) notFound();

  const details = product.details;
  const highlights = details?.highlights ?? [product.tag];

  return (
    <>
      <CompactHeader />
      <nav aria-label="Breadcrumb" className={`container ${styles.breadcrumb}`}>
        <Link href="/">Home</Link>
        <span aria-hidden="true">/</span>
        <Link href="#">{departmentLabels[product.department]}</Link>
        {product.collection && (
          <>
            <span aria-hidden="true">/</span>
            <Link href="#">{product.collection}</Link>
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
            {product.brand && <span className={styles.brand}>{product.brand}</span>}
            <h1 className={styles.title}>{product.name}</h1>
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

          <div className={styles.serviceBox}>
            <div className={styles.serviceRow}>
              <Icon name="truck" size={22} />
              <span>
                <strong>
                  Delivery to {defaultDeliveryArea}, {city}
                </strong>{' '}
                <Link href="#" className={styles.serviceLink}>
                  Change
                </Link>
                <br />
                <span className={styles.muted}>
                  Order before {pending.orderCutoffTime} for delivery in {pending.deliveryDays} working days. Tracked from
                  packing to door.
                </span>
              </span>
            </div>
            <div className={styles.serviceRow}>
              <Icon name="refresh" size={22} />
              <span>
                <strong>Returns</strong>
                <br />
                <span className={styles.muted}>
                  Unopened and sealed within {pending.returnWindowDays} days. Damaged or not genuine: full refund to your
                  MoMo wallet or card.
                </span>
              </span>
            </div>
          </div>
        </div>
      </main>

      <section className={`container ${styles.tabsSection}`}>
        <ProductInfoTabs product={product} />
      </section>

      <section className={`container ${styles.relatedSection}`}>
        <h2 className={styles.relatedTitle}>You may also like</h2>
        <div className={styles.relatedGrid}>
          {related.map((r) => (
            <Link key={r.slug} href={`/products/${r.slug}`} className={styles.relatedCard}>
              <ProductImage
                image={r.image}
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
      <SiteFooter />
    </>
  );
}
