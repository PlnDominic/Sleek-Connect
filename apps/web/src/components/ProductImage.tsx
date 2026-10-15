import Image from 'next/image';
import { kindIcon, type ImageKey, type ProductKind } from '@sleek/shared';
import { images } from '@/lib/images';
import { Icon } from './Icon';
import styles from './ProductImage.module.css';

interface ProductImageProps {
  image?: ImageKey;
  tint: string;
  kind: ProductKind;
  alt: string;
  sizes: string;
  className?: string;
  position?: 'center' | 'left' | 'right' | 'top';
  priority?: boolean;
  /** Absolutely fill the nearest positioned ancestor. */
  fill?: boolean;
}

/** A product photo, or a tinted placeholder with the product's shape when no photo exists yet. */
export function ProductImage({ image, tint, kind, alt, sizes, className, position = 'center', priority, fill }: ProductImageProps) {
  return (
    <span className={`${styles.frame} ${fill ? styles.fill : ''} ${className ?? ''}`} style={{ background: tint }}>
      {image ? (
        <Image
          src={images[image]}
          alt={alt}
          fill
          sizes={sizes}
          priority={priority}
          className={styles.photo}
          style={{ objectPosition: position === 'top' ? 'center top' : position }}
        />
      ) : (
        <span className={styles.placeholder} role={alt ? 'img' : undefined} aria-label={alt || undefined}>
          <Icon name={kindIcon[kind]} size={44} strokeWidth={1.4} />
        </span>
      )}
    </span>
  );
}
