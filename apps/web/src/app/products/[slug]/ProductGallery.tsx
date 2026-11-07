'use client';

import { useState } from 'react';
import { colors, type GalleryView, type Product } from '@sleek/shared';
import { ProductImage } from '@/components/ProductImage';
import styles from './product.module.css';

const thumbTints = [colors.tealSoft, colors.tealPale, colors.surface, colors.blush];

type View = Omit<GalleryView, 'image'> & { image?: GalleryView['image']; photo?: string };

export function ProductGallery({ product }: { product: Product }) {
  // Uploaded photos replace the design's sample gallery.
  const views: View[] = product.photos?.length
    ? product.photos.map((p, i) => ({ label: p.alt ?? `Photo ${i + 1}`, photo: p.url, position: 'center' }))
    : (product.details?.gallery ?? (product.image ? [{ label: 'Front view', image: product.image, position: 'center' }] : []));
  const [selected, setSelected] = useState(0);
  const current = views[selected];

  return (
    <div className={styles.gallery}>
      <div className={styles.mainImage} style={{ background: product.tint }}>
        <ProductImage
          image={current?.image}
          photo={current?.photo}
          tint={product.tint}
          kind={product.kind}
          alt={`${product.name}, ${current?.label.toLowerCase() ?? 'product photo'}`}
          sizes="(max-width: 1000px) 100vw, 620px"
          position={current?.position}
          priority
          fill
        />
        {product.badge === 'New' && <span className={styles.newBadge}>New</span>}
      </div>
      {views.length > 1 && (
        <div className={styles.thumbs}>
          {views.map((view, i) => (
            <button
              key={`${i}-${view.label}`}
              type="button"
              aria-label={view.label}
              aria-pressed={i === selected}
              onClick={() => setSelected(i)}
              className={styles.thumb}
              style={{ background: thumbTints[i % thumbTints.length] }}
            >
              <ProductImage image={view.image} photo={view.photo} tint="transparent" kind={product.kind} alt="" sizes="140px" position={view.position} fill />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
