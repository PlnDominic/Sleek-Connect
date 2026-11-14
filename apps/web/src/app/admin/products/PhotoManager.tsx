'use client';

import Image from 'next/image';
import { useState, useTransition, type ChangeEvent } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { addProductPhoto, arrangeProductPhotos, removeProductPhoto, type PhotoResult } from './actions';
import styles from '../admin.module.css';

export interface Photo {
  id: string;
  url: string;
  alt: string;
}

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 8;

/** Upload, order, describe and remove a product's photos. The first photo is the main one on the store. */
export function PhotoManager({ productId, photos, canEdit }: { productId: string; photos: Photo[]; canEdit: boolean }) {
  const [order, setOrder] = useState(photos);
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [busy, startTransition] = useTransition();
  // Keep the edited order when the server sends fresh props, unless photos were added or removed.
  const sameSet = order.length === photos.length && order.every((p) => photos.some((q) => q.id === p.id));
  const list = sameSet ? order : photos;
  const changed = list.some((p, i) => p.id !== photos[i]?.id || p.alt !== photos[i]?.alt);

  const move = (i: number, by: number) => {
    const next = [...list];
    const [photo] = next.splice(i, 1);
    next.splice(i + by, 0, photo);
    setOrder(next);
  };

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const bad = files.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) return setResult({ ok: false, message: `${bad.name}: use JPEG, PNG or WebP photos under 5 MB.` });
    if (list.length + files.length > MAX_PHOTOS) return setResult({ ok: false, message: `A product can have up to ${MAX_PHOTOS} photos.` });
    startTransition(async () => {
      const storage = createBrowserSupabase().storage.from('product-images');
      for (const file of files) {
        const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
        const path = `${productId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await storage.upload(path, file, { contentType: file.type, cacheControl: '31536000' });
        if (error) {
          console.error(error);
          return setResult({ ok: false, message: `${file.name} didn’t upload. Check your connection and try again.` });
        }
        const added = await addProductPhoto(productId, path);
        if (!added.ok) return setResult(added);
      }
      setResult({ ok: true, message: files.length === 1 ? 'Photo added.' : `${files.length} photos added.` });
    });
  };

  return (
    <section className={styles.panel} aria-labelledby="photos-title">
      <h2 id="photos-title">Photos</h2>
      <p className={styles.muted}>
        The first photo is the main one in listings and the bag. Square photos on a plain background work best. Up to{' '}
        {MAX_PHOTOS} photos; JPEG, PNG or WebP under 5 MB. They’re resized for each screen automatically.
      </p>
      {list.length === 0 && <p className={styles.empty}>No photos yet. The store shows the sample picture or a placeholder.</p>}
      <ol className={styles.photos}>
        {list.map((p, i) => (
          <li key={p.id} className={styles.photo}>
            <Image src={p.url} alt={p.alt || `Photo ${i + 1}`} width={120} height={120} className={styles.photoImage} />
            <div className={styles.photoBody}>
              {i === 0 && <span className={styles.badge} data-tone="good">Main photo</span>}
              <label className={styles.field}>
                <span>Description (for screen readers)</span>
                <input
                  value={p.alt}
                  maxLength={200}
                  disabled={!canEdit || busy}
                  placeholder="e.g. Front of the bottle"
                  onChange={(e) => setOrder(list.map((q) => (q.id === p.id ? { ...q, alt: e.target.value } : q)))}
                />
              </label>
              {canEdit && (
                <div className={styles.buttons}>
                  <button type="button" className={styles.secondary} disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move photo ${i + 1} earlier`}>
                    ↑
                  </button>
                  <button type="button" className={styles.secondary} disabled={busy || i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Move photo ${i + 1} later`}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className={styles.danger}
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm('Remove this photo?')) return;
                      startTransition(async () => setResult(await removeProductPhoto(p.id)));
                    }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      {canEdit && (
        <div className={styles.buttons}>
          {changed && (
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onClick={() => startTransition(async () => setResult(await arrangeProductPhotos(productId, list.map((p) => ({ id: p.id, alt: p.alt })))))}
            >
              Save order and descriptions
            </button>
          )}
          {list.length < MAX_PHOTOS && (
            <label className={styles.secondary}>
              {busy ? 'Working…' : 'Upload photos'}
              <input type="file" accept={TYPES.join(',')} multiple hidden disabled={busy} onChange={upload} />
            </label>
          )}
        </div>
      )}
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={result.ok ? styles.success : styles.error}>
          {result.message}
        </p>
      )}
    </section>
  );
}
