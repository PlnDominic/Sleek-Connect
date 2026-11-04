'use client';

import Image from 'next/image';
import { useState, useTransition, type ChangeEvent } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { clearCategoryPhoto, setCategoryPhoto, type CategoryPhotoResult } from './actions';
import styles from '../admin.module.css';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** The picture for one category: choose a file to upload it (it replaces the current one), or remove it. */
export function CategoryPhoto({ id, name, url, path, canEdit }: { id: string; name: string; url: string | null; path: string | null; canEdit: boolean }) {
  const [result, setResult] = useState<CategoryPhotoResult | null>(null);
  const [busy, startTransition] = useTransition();

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) return setResult({ ok: false, message: 'Use a JPEG, PNG or WebP photo under 5 MB.' });
    startTransition(async () => {
      const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const newPath = `categories/${id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await createBrowserSupabase().storage.from('product-images').upload(newPath, file, { contentType: file.type, cacheControl: '31536000' });
      if (error) {
        console.error(error);
        return setResult({ ok: false, message: 'The photo didn’t upload. Check your connection and try again.' });
      }
      setResult(await setCategoryPhoto(id, newPath, path));
    });
  };

  return (
    <section className={styles.panel} aria-label={name}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        {url ? (
          <Image src={url} alt="" width={160} height={120} style={{ objectFit: 'cover', borderRadius: 12 }} />
        ) : (
          <div aria-hidden="true" style={{ width: 160, height: 120, borderRadius: 12, background: 'rgb(11 31 58 / 0.06)' }} />
        )}
        <div>
          <h2>{name}</h2>
          <p className={styles.muted}>{url ? 'Shown on the home page and in the app.' : 'No photo yet: shoppers see a plain coloured tile.'}</p>
          {canEdit && (
            <div className={styles.buttons}>
              <label className={styles.secondary} style={{ cursor: busy ? 'wait' : 'pointer' }}>
                {busy ? 'Uploading…' : url ? 'Replace photo' : 'Upload photo'}
                <input type="file" accept={TYPES.join(',')} onChange={upload} disabled={busy} hidden />
              </label>
              {url && (
                <button type="button" className={styles.secondary} disabled={busy} onClick={() => startTransition(async () => setResult(await clearCategoryPhoto(id, path)))}>
                  Remove
                </button>
              )}
            </div>
          )}
          {result && (
            <p role="status" className={result.ok ? styles.muted : styles.notice}>
              {result.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
