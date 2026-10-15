import Link from 'next/link';
import { colors, formatPrice, type Product } from '@sleek/shared';
import { AddToBagButton } from './AddToBagButton';
import { Icon } from './Icon';
import { ProductImage } from './ProductImage';
import styles from './ProductCard.module.css';

/** Product tile used in the home page rails and listing grids. */
export function ProductCard({ product }: { product: Product }) {
  const soldOut = product.inStock === false;
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
        {soldOut ? <span className={styles.soldOut}>Sold out</span> : <span>{product.tag}</span>}
        <AddToBagButton
          product={product}
          disabled={soldOut}
          label={soldOut ? `${product.name} is sold out` : `Add ${product.name} to bag`}
          className={styles.roundAdd}
        >
          <Icon name="bag" size={15} strokeWidth={2} />
        </AddToBagButton>
      </div>
    </article>
  );
}
