'use client';

import Image from 'next/image';
import { useState, useTransition, type ChangeEvent } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { addProductPhoto, removeProductPhoto, type PhotoResult } from './actions';
import styles from './vendor.module.css';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 8;

/** Upload and remove a product's photos. The first photo is the main one on the store. */
export function PhotoManager({ productId, photos }: { productId: string; photos: { id: string; url: string }[] }) {
  const [result, setResult] = useState<PhotoResult | null>(null);
  const [busy, startTransition] = useTransition();

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    const bad = files.find((f) => !TYPES.includes(f.type) || f.size > MAX_BYTES);
    if (bad) return setResult({ ok: false, message: `${bad.name}: use JPEG, PNG or WebP photos under 5 MB.` });
    if (photos.length + files.length > MAX_PHOTOS) return setResult({ ok: false, message: `A product can have up to ${MAX_PHOTOS} photos.` });
    startTransition(async () => {
      const storage = createBrowserSupabase().storage.from('product-images');
      for (const file of files) {
        const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
        const path = `${productId}/${crypto.randomUUID()}.${ext}`;
        const { error } = await storage.upload(path, file, { contentType: file.type, cacheControl: '31536000' });
        if (error) return setResult({ ok: false, message: `${file.name} didn’t upload. Check your connection and try again.` });
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
        The first photo is the main one. Square photos on a plain background work best. Up to {MAX_PHOTOS} photos; JPEG, PNG or WebP under 5 MB.
      </p>
      {photos.length > 0 && (
        <ul className={styles.photos}>
          {photos.map((p, i) => (
            <li key={p.id}>
              <Image src={p.url} alt={`Photo ${i + 1}`} width={110} height={110} className={styles.photo} />
              <button
                type="button"
                className={styles.linkButton}
                disabled={busy}
                onClick={() => {
                  if (!window.confirm('Remove this photo?')) return;
                  startTransition(async () => setResult(await removeProductPhoto(p.id)));
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      {photos.length < MAX_PHOTOS && (
        <label className={styles.secondary}>
          {busy ? 'Working…' : 'Upload photos'}
          <input type="file" accept={TYPES.join(',')} multiple hidden disabled={busy} onChange={upload} />
        </label>
      )}
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={result.ok ? styles.success : styles.error}>
          {result.message}
        </p>
      )}
    </section>
  );
}
