'use client';

import Image from 'next/image';
import { useState, useTransition, type ChangeEvent } from 'react';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { saveStoreImage } from './actions';
import styles from './vendor.module.css';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

/** Upload or remove the store logo or banner. The browser sends the file to Storage; the database records the path. */
export function ImageUploader({ vendorId, kind, url }: { vendorId: string; kind: 'logo' | 'banner'; url?: string }) {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const label = kind === 'logo' ? 'Logo' : 'Banner';

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!TYPES.includes(file.type) || file.size > MAX_BYTES) return setMessage({ ok: false, text: 'Use a JPEG, PNG or WebP image under 5 MB.' });
    startTransition(async () => {
      const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
      const path = `${vendorId}/${kind}-${crypto.randomUUID()}.${ext}`;
      const { error } = await createBrowserSupabase().storage.from('vendor-assets').upload(path, file, { contentType: file.type, cacheControl: '31536000' });
      if (error) return setMessage({ ok: false, text: 'The image didn’t upload. Check your connection and try again.' });
      const saved = await saveStoreImage(kind, path);
      setMessage({ ok: Boolean(saved?.ok), text: saved?.message ?? 'Image saved.' });
    });
  };

  return (
    <div className={styles.uploader}>
      {url ? (
        <Image src={url} alt={`Your store ${kind}`} width={kind === 'logo' ? 80 : 240} height={80} className={styles.preview} />
      ) : (
        <span className={styles.previewEmpty}>No {kind} yet</span>
      )}
      <div className={styles.buttons}>
        <label className={styles.secondary}>
          {busy ? 'Working…' : url ? `Change ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          <input type="file" accept={TYPES.join(',')} hidden disabled={busy} onChange={upload} />
        </label>
        {url && (
          <button type="button" className={styles.linkButton} disabled={busy} onClick={() => startTransition(async () => {
            const saved = await saveStoreImage(kind, null);
            setMessage({ ok: Boolean(saved?.ok), text: saved?.message ?? 'Image removed.' });
          })}>
            Remove
          </button>
        )}
      </div>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? styles.success : styles.error}>
          {message.text}
        </p>
      )}
    </div>
  );
}
