'use client';

import { useState, useTransition, type ChangeEvent } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { Icon } from '@/components/Icon';
import { setCategoryPhoto, type CategoryPhotoResult } from './actions';
import styles from '../admin.module.css';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** The photo button in a category's row: choose a file to upload it (it replaces the current one). */
export function CategoryPhotoButton({ id, name, hasPhoto, path }: { id: string; name: string; hasPhoto: boolean; path: string | null }) {
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
    <>
      <label
        className={styles.iconButton}
        style={{ cursor: busy ? 'wait' : 'pointer' }}
        title={hasPhoto ? 'Replace photo' : 'Upload photo'}
        aria-label={hasPhoto ? `Replace photo for ${name}` : `Upload photo for ${name}`}
      >
        <Icon name="image" size={16} />
        <input type="file" accept={TYPES.join(',')} onChange={upload} disabled={busy} hidden />
      </label>
      {result && (
        <span role="status" className={result.ok ? styles.muted : styles.notice}>
          {result.message}
        </span>
      )}
    </>
  );
}
