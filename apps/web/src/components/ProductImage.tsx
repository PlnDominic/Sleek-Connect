import Image from 'next/image';
import { kindIcon, type ImageKey, type ProductKind } from '@sleek/shared';
import { images } from '@/lib/images';
import { Icon } from './Icon';
import styles from './ProductImage.module.css';

interface ProductImageProps {
  image?: ImageKey;
  /** An uploaded photo's URL; used instead of `image`. */
  photo?: string;
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
export function ProductImage({ image, photo, tint, kind, alt, sizes, className, position = 'center', priority, fill }: ProductImageProps) {
  const src = photo ?? (image ? images[image] : undefined);
  return (
    <span className={`${styles.frame} ${fill ? styles.fill : ''} ${className ?? ''}`} style={{ background: tint }}>
      {src ? (
        <Image
          src={src}
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
