import Image from 'next/image';
import Link from 'next/link';
import {
  bestSellers,
  categories,
  colors,
  formatPrice,
  getProduct,
  newArrivals,
  pending,
  type IconName,
  type Product,
} from '@sleek/shared';
import { AddToBagButton } from '@/components/AddToBagButton';
import { Icon } from '@/components/Icon';
import { NewArrivalsRail } from '@/components/NewArrivalsRail';
import { ProductImage } from '@/components/ProductImage';
import { SiteFooter } from '@/components/SiteFooter';
import { AnnouncementBar, SiteHeader } from '@/components/SiteHeader';
import { images } from '@/lib/images';
import styles from './home.module.css';

export default function HomePage() {
  return (
    <>
      <AnnouncementBar />
      <SiteHeader current="Home" />
      <main>
        <Hero />
        <FeatureStrip />
        <Categories />
        <NewArrivals />
        <BestSellers />
        <Promotions />
        <TrustBar />
      </main>
      <SiteFooter />
    </>
  );
}

const heroCards = [
  { slug: 'vitamin-c-brightening-serum', label: 'Vitamin C Serum', className: styles.floatSerum },
  { slug: 'whipped-shea-body-butter', label: 'Shea Body Butter', className: styles.floatShea },
  { slug: 'velvet-matte-lip-colour', label: 'Matte Lip Colour', className: styles.floatLip },
  { slug: 'gentle-baby-wash-shampoo', label: 'Baby Wash, 400 ml', className: styles.floatBabyWash },
];

function Hero() {
  return (
    <section className={styles.hero}>
      <div className={`container ${styles.heroInner}`}>
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>Trending now</span>
          <h1 className={styles.heroTitle}>
            Glow Products
            <br />
            You&apos;ll Love
          </h1>
          <p className={styles.heroLead}>
            Authentic beauty and safe picks for little ones,
            <br />
            curated for modern families in Ghana.
          </p>
          <div className={styles.heroActions}>
            <Link href="#new-arrivals" className={styles.primaryCta}>
              Shop Now <Icon name="arrowRight" size={17} strokeWidth={2} />
            </Link>
            <Link href="/products/gentle-baby-wash-shampoo" className={styles.secondaryCta}>
              Shop Baby &amp; Kids
            </Link>
          </div>
          <div className={styles.socialProof}>
            <span className={styles.avatars} aria-hidden="true">
              {colors.avatar.map((tone) => (
                <span key={tone} style={{ background: tone }} />
              ))}
            </span>
            <span>Loved by {pending.shopperCount}+ shoppers across Accra</span>
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
            src={images.heroModel}
            alt="Woman with natural hair and glowing skin"
            priority
            sizes="(max-width: 900px) 50vw, 300px"
            className={styles.heroModel}
          />
          {heroCards.map((card) => {
            const product = getProduct(card.slug)!;
            return (
              <Link key={card.slug} href={`/products/${card.slug}`} className={`${styles.floatCard} ${card.className}`}>
                <ProductImage image={product.image} tint={product.tint} kind={product.kind} alt="" sizes="126px" className={styles.floatImage} />
                <span className={styles.floatName}>{card.label}</span>
                <strong className={styles.floatPrice}>{formatPrice(product.price)}</strong>
              </Link>
            );
          })}
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

const features: { icon: IconName; title: string; sub: string }[] = [
  { icon: 'truck', title: 'Tracked Delivery', sub: 'Across Accra, to your door' },
  { icon: 'lockKeyhole', title: 'Secure Payments', sub: 'Mobile Money and card' },
  { icon: 'shieldCheck', title: 'Authentic Guarantee', sub: 'Full refund if not genuine' },
  { icon: 'headset', title: 'Real Support', sub: 'Always here to help' },
];

function FeatureStrip() {
  return (
    <section className="container">
      <div className={styles.features}>
        {features.map((f) => (
          <div key={f.title} className={styles.feature}>
            <Icon name={f.icon} size={30} strokeWidth={1.5} />
            <span className={styles.featureText}>
              <strong>{f.title}</strong>
              <span>{f.sub}</span>
            </span>
          </div>
        ))}
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

function Categories() {
  return (
    <section id="categories" className={`container ${styles.section}`}>
      <SectionHeader title="Shop by Categories" linkLabel="View All Categories" />
      <div className={styles.categoryGrid}>
        {categories.map((c) => (
          <Link key={c.id} href="#" className={styles.categoryCard}>
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

function ProductCard({ product }: { product: Product }) {
  return (
    <article className={styles.productCard}>
      <div className={styles.productCardTop}>
        {product.badge ? (
          <span className={styles.badge} style={{ background: product.badge === 'New' ? colors.ink : colors.accent }}>
            {product.badge}
          </span>
        ) : (
          <span />
        )}
        <button type="button" aria-label={`Save ${product.name}`} className={styles.saveButton}>
          <Icon name="heart" size={17} />
        </button>
      </div>
      <ProductImage
        image={product.image}
        tint={colors.surfaceSunken}
        kind={product.kind}
        alt={product.name}
        sizes="(max-width: 600px) 50vw, 200px"
        className={styles.productCardImage}
      />
      <Link href={`/products/${product.slug}`} className={styles.productCardName}>
        {product.name}
      </Link>
      <span className={styles.priceRow}>
        <strong>{formatPrice(product.price)}</strong>
        {product.was && <s>{formatPrice(product.was)}</s>}
      </span>
      <div className={styles.productCardFooter}>
        <span>{product.tag}</span>
        <AddToBagButton slug={product.slug} sizeId={product.defaultSize} label={`Add ${product.name} to bag`} className={styles.roundAdd}>
          <Icon name="bag" size={15} strokeWidth={2} />
        </AddToBagButton>
      </div>
    </article>
  );
}

function NewArrivals() {
  return (
    <section id="new-arrivals" className={`container ${styles.section}`}>
      <SectionHeader title="New Arrivals" linkLabel="View All New Arrivals" />
      <NewArrivalsRail>
        {newArrivals.map((p) => (
          <ProductCard key={p.slug} product={p} />
        ))}
      </NewArrivalsRail>
    </section>
  );
}

function BestSellers() {
  return (
    <section id="best-sellers" className={`container ${styles.section}`}>
      <SectionHeader title="Best Sellers" linkLabel="View All Best Sellers" />
      <div className={styles.bestGrid}>
        {bestSellers.map((p) => (
          <article key={p.slug} className={styles.bestCard}>
            <div className={styles.bestMedia}>
              <ProductImage image={p.image} tint={colors.surfaceSunken} kind={p.kind} alt={p.name} sizes="200px" className={styles.bestImage} />
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
                <AddToBagButton slug={p.slug} sizeId={p.defaultSize} className={styles.quickAdd}>
                  Quick Add
                </AddToBagButton>
                <AddToBagButton slug={p.slug} sizeId={p.defaultSize} label={`Add ${p.name} to bag`} className={styles.squareAdd}>
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

const countdown = [
  { value: '02', unit: 'Days' },
  { value: '15', unit: 'Hours' },
  { value: '45', unit: 'Mins' },
  { value: '30', unit: 'Secs' },
];

function Promotions() {
  return (
    <section className={`container ${styles.promoSection}`}>
      <div className={styles.promoGrid}>
        <div className={`${styles.promo} ${styles.promoSale}`}>
          <span className={styles.promoKicker}>Flash Sale</span>
          <strong className={styles.promoTitle}>Up To {pending.saleMaxPercent}% Off</strong>
          {/* Sale end time is not set yet; these are the design's sample values. */}
          <div aria-label="Sale ends in 2 days, 15 hours, 45 minutes" className={styles.countdown}>
            {countdown.map((part, i) => (
              <span key={part.unit} className={styles.countdownPart}>
                {i > 0 && <strong aria-hidden="true">:</strong>}
                <span>
                  <strong>{part.value}</strong>
                  <span>{part.unit}</span>
                </span>
              </span>
            ))}
          </div>
          <Link href="#" className={`${styles.promoCta} ${styles.promoCtaSale}`}>
            Shop Sale Now
          </Link>
          <Image src={images.flashSale} alt="" sizes="(max-width: 900px) 44vw, 270px" className={styles.promoImage} />
        </div>
        <div className={`${styles.promo} ${styles.promoGift}`}>
          <span className={styles.promoKicker}>New Collection</span>
          <strong className={styles.promoTitle}>Gift Season 2026</strong>
          <span className={styles.promoText}>Wrapped gift sets for her, for him and for little ones.</span>
          <Link href="/products/newborn-gift-hamper" className={styles.promoCta}>
            Shop Collection
          </Link>
          <Image src={images.giftCollection} alt="" sizes="(max-width: 900px) 44vw, 270px" className={styles.promoImage} />
        </div>
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
