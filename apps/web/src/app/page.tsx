import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { colors, formatPrice, type Category, type IconName, type Product } from '@sleek/shared';
import { AddToBagButton } from '@/components/AddToBagButton';
import { Icon } from '@/components/Icon';
import { JsonLd } from '@/components/JsonLd';
import { NewArrivalsRail } from '@/components/NewArrivalsRail';
import { ProductCard } from '@/components/ProductCard';
import { ProductImage } from '@/components/ProductImage';
import { SiteFooter } from '@/components/SiteFooter';
import { AnnouncementBar, SiteHeader } from '@/components/SiteHeader';
import { Countdown } from '@/components/Countdown';
import { getHomeCatalog } from '@/lib/catalog';
import { getHomeContent, type Banner } from '@/lib/content';
import { images } from '@/lib/images';
import { siteName, siteUrl } from '@/lib/site';
import styles from './home.module.css';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export default async function HomePage() {
  const [{ categories, newArrivals, bestSellers }, { hero, promos, heroProducts }] = await Promise.all([
    getHomeCatalog(),
    getHomeContent(),
  ]);

  const base = siteUrl();
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'Organization',
              '@id': `${base}/#organization`,
              name: siteName,
              url: base,
              address: { '@type': 'PostalAddress', addressLocality: 'Accra', addressCountry: 'GH' },
              areaServed: 'Accra, Ghana',
            },
            {
              '@type': 'WebSite',
              '@id': `${base}/#website`,
              url: base,
              name: siteName,
              publisher: { '@id': `${base}/#organization` },
              // Lets search engines offer a search box for the store in their results.
              potentialAction: {
                '@type': 'SearchAction',
                target: { '@type': 'EntryPoint', urlTemplate: `${base}/search?q={search_term_string}` },
                'query-input': 'required name=search_term_string',
              },
            },
          ],
        }}
      />
      <AnnouncementBar />
      <SiteHeader current="Home" />
      <main>
        <Hero banner={hero ?? defaultHero} products={heroProducts} />
        <Categories categories={categories} />
        <NewArrivals products={newArrivals} />
        <BestSellers products={bestSellers} />
        {promos.length > 0 && <Promotions banners={promos} />}
        <TrustBar />
      </main>
      <SiteFooter />
    </>
  );
}

/** Shown if staff remove every hero banner. Matches the starter banner. */
const defaultHero: Banner = {
  id: 'default',
  kicker: 'Trending now',
  title: 'Glow Products\nYou\'ll Love',
  body: 'Authentic beauty and safe picks for little ones,\ncurated for modern families in Ghana.',
  cta: { label: 'Shop Now', href: '/shop?sort=newest' },
  secondaryCta: { label: 'Shop Baby & Kids', href: '/shop/kids' },
  image: 'heroModel',
  theme: 'light',
};

/** Text with line breaks where staff typed them. */
function Lines({ text }: { text: string }) {
  return text.split('\n').map((line, i) => (
    <span key={i}>
      {i > 0 && <br />}
      {line}
    </span>
  ));
}

// Positions of the floating product cards around the hero image, in collection order.
const floatPositions = [styles.floatSerum, styles.floatShea, styles.floatLip, styles.floatBabyWash];

function Hero({ banner, products }: { banner: Banner; products: Product[] }) {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          {banner.kicker && <span className={styles.kicker}>{banner.kicker}</span>}
          <h1 className={styles.heroTitle}>
            <Lines text={banner.title} />
          </h1>
          {banner.body && (
            <p className={styles.heroLead}>
              <Lines text={banner.body} />
            </p>
          )}
          <div className={styles.heroActions}>
            {banner.cta && (
              <Link href={banner.cta.href} className={styles.primaryCta}>
                {banner.cta.label} <Icon name="arrowRight" size={17} strokeWidth={2} />
              </Link>
            )}
            {banner.secondaryCta && (
              <Link href={banner.secondaryCta.href} className={styles.secondaryCta}>
                {banner.secondaryCta.label}
              </Link>
            )}
          </div>
        </div>

        <div className={styles.heroVisual}>
          <svg aria-hidden="true" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid meet" className={styles.heroBlob}>
            <path
              d="M420 40c90 30 150 130 130 240s-80 210-190 250-260 10-300-90 30-170 80-230S330 10 420 40z"
              fill={colors.accentBlob}
            />
            <path
              d="M455 95c55 30 80 100 66 170"
              fill="none"
              stroke={colors.accentBlobLight}
              strokeWidth="22"
              strokeLinecap="round"
              opacity="0.7"
            />
          </svg>
          <Image
            src={images[banner.image ?? 'heroModel']}
            alt=""
            priority
            sizes="(max-width: 900px) 50vw, 300px"
            className={styles.heroModel}
          />
          {products.slice(0, floatPositions.length).map((product, i) => (
            <Link key={product.slug} href={`/products/${product.slug}`} className={`${styles.floatCard} ${floatPositions[i]}`}>
              <ProductImage image={product.image} photo={product.photos?.[0]?.url} tint={product.tint} kind={product.kind} alt="" sizes="126px" className={styles.floatImage} />
              <span className={styles.floatName}>{product.name}</span>
              <strong className={styles.floatPrice}>{formatPrice(product.price)}</strong>
            </Link>
          ))}
          <div aria-hidden="true" className={styles.heroDots}>
            <span />
            <span className={styles.heroDotActive} />
            <span />
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({ title, linkLabel, href = '#' }: { title: string; linkLabel: string; href?: string }) {
  return (
    <div className={styles.sectionHeader}>
      <h2>{title}</h2>
      <Link href={href}>
        {linkLabel} <Icon name="arrowRight" size={15} strokeWidth={2} />
      </Link>
    </div>
  );
}

function Categories({ categories }: { categories: Category[] }) {
  return (
    <section id="categories" className={`container ${styles.section}`}>
      <SectionHeader title="Shop by Categories" linkLabel="View All Categories" href="/shop" />
      <div className={styles.categoryGrid}>
        {categories.map((c) => (
          <Link key={c.id} href={`/shop/${c.department}/${c.id}`} className={styles.categoryCard}>
            <ProductImage image={c.image} tint={c.tint} kind={c.kind} alt="" sizes="(max-width: 600px) 50vw, 200px" fill />
            <span className={styles.categoryLabel}>
              <strong>{c.name}</strong>
              <span>
                Shop Now <Icon name="arrowRight" size={14} strokeWidth={2} />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}


function NewArrivals({ products }: { products: Product[] }) {
  return (
    <section id="new-arrivals" className={`container ${styles.section}`}>
      <SectionHeader title="New Arrivals" linkLabel="View All New Arrivals" href="/shop?sort=newest" />
      <NewArrivalsRail>
        {products.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </NewArrivalsRail>
    </section>
  );
}

function BestSellers({ products }: { products: Product[] }) {
  return (
    <section id="best-sellers" className={`container ${styles.section}`}>
      <SectionHeader title="Best Sellers" linkLabel="View All Best Sellers" href="/shop" />
      <div className={styles.bestGrid}>
        {products.map((p) => (
          <article key={p.slug} className={styles.bestCard}>
            <div className={styles.bestMedia}>
              <ProductImage image={p.image} photo={p.photos?.[0]?.url} tint={colors.surfaceSunken} kind={p.kind} alt={p.name} sizes="200px" className={styles.bestImage} />
              <span className={styles.bestBadge}>Bestseller</span>
            </div>
            <div className={styles.bestBody}>
              <Link href={`/products/${p.slug}`} className={styles.bestName}>
                {p.name}
              </Link>
              <strong className={styles.bestPrice}>{formatPrice(p.price)}</strong>
              <span className={styles.bestTag} style={{ color: p.department === 'kids' ? colors.teal : colors.textSubtle }}>
                {p.tag}
              </span>
              <span className={styles.bestSummary}>{p.summary}</span>
              <div className={styles.bestActions}>
                <AddToBagButton product={p} disabled={p.inStock === false} className={styles.quickAdd}>
                  {p.inStock === false ? 'Sold out' : 'Quick Add'}
                </AddToBagButton>
                <AddToBagButton
                  product={p}
                  disabled={p.inStock === false}
                  label={`Add ${p.name} to bag`}
                  className={styles.squareAdd}
                >
                  <Icon name="bag" size={16} />
                </AddToBagButton>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

const promoThemes = { sale: styles.promoSale, gift: styles.promoGift, light: styles.promoLight };

function Promotions({ banners }: { banners: Banner[] }) {
  return (
    <section className={`container ${styles.promoSection}`}>
      <div className={styles.promoGrid}>
        {banners.map((b) => (
          <div key={b.id} className={`${styles.promo} ${promoThemes[b.theme]}`}>
            {b.kicker && <span className={styles.promoKicker}>{b.kicker}</span>}
            <strong className={styles.promoTitle}>{b.title}</strong>
            {b.body && <span className={styles.promoText}>{b.body}</span>}
            {b.countdownTo && <Countdown to={b.countdownTo} className={styles.countdown} partClassName={styles.countdownPart} />}
            {b.cta && (
              <Link href={b.cta.href} className={`${styles.promoCta} ${b.theme === 'sale' ? styles.promoCtaSale : ''}`}>
                {b.cta.label}
              </Link>
            )}
            {b.image && <Image src={images[b.image]} alt="" sizes="(max-width: 900px) 44vw, 270px" className={styles.promoImage} />}
          </div>
        ))}
      </div>
    </section>
  );
}

const trust: { icon: IconName; title: string; sub: string }[] = [
  { icon: 'shieldCheck', title: '100% Authentic', sub: 'From authorised distributors only' },
  { icon: 'truck', title: 'Fast Delivery', sub: 'Tracked from packing to door' },
  { icon: 'lock', title: 'Secure Checkout', sub: 'MoMo and card, safely processed' },
  { icon: 'smile', title: 'Customer Support', sub: 'Chat, call or WhatsApp us' },
];

function TrustBar() {
  return (
    <section className={`container ${styles.trustSection}`}>
      <div className={styles.trust}>
        {trust.map((t) => (
          <div key={t.title} className={styles.trustItem}>
            <Icon name={t.icon} size={26} strokeWidth={1.5} />
            <span>
              <strong>{t.title}</strong>
              <span>{t.sub}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
