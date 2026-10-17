'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { asImageKey, type ProductKind } from '@sleek/shared';
import { ProductImage } from '@/components/ProductImage';
import { faultReasons, returnReasons, type ReturnReason } from '@/lib/orders';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import styles from '../../../help/help.module.css';

export interface ReturnableItem {
  id: string;
  name: string;
  sizeLabel: string | null;
  available: number;
  returnable: boolean;
  returnNote: string | null;
  image: string | null;
  photo: string | null;
  tint: string | null;
  kind: ProductKind | null;
}

const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

interface Photo {
  file: File;
  preview: string;
  /** Where it was uploaded, so a retry doesn't upload it again. */
  path?: string;
}

interface ReturnFormProps {
  token: string;
  /** Storage folder for this order's photos. */
  photoFolder: string;
  orderNumber: string;
  items: ReturnableItem[];
}

export function ReturnForm({ token, photoFolder, orderNumber, items }: ReturnFormProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | ''>('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [caseNumber, setCaseNumber] = useState<string | null>(null);
  const photosRef = useRef(photos);

  useEffect(() => {
    photosRef.current = photos;
  });
  // Free the previews when leaving the page.
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.preview)), []);

  const fault = reason !== '' && faultReasons.includes(reason);

  const addPhotos = (files: FileList | null) => {
    setError(null);
    const picked = [...(files ?? [])];
    const bad = picked.find((f) => !PHOTO_TYPES.includes(f.type) || f.size > MAX_PHOTO_BYTES);
    if (bad) {
      setError(`${bad.name} can’t be attached. Use JPEG, PNG, WebP or HEIC photos under 5 MB.`);
      return;
    }
    setPhotos((current) =>
      [...current, ...picked.map((file) => ({ file, preview: URL.createObjectURL(file) }))].slice(0, MAX_PHOTOS),
    );
  };

  const removePhoto = (i: number) =>
    setPhotos((current) => {
      URL.revokeObjectURL(current[i].preview);
      return current.filter((_, j) => j !== i);
    });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const details = String(form.get('details') ?? '').trim();
    const chosen = items.filter((i) => (quantities[i.id] ?? 0) > 0);

    if (chosen.length === 0) return setError('Choose at least one item to return.');
    if (!reason) return setError('Choose a reason for the return.');
    const blocked = chosen.find((i) => !i.returnable && !fault);
    if (blocked) {
      return setError(`${blocked.name} can only be returned if it arrived damaged, wrong or expired.`);
    }
    if (reason === 'other' && !details) return setError('Tell us what’s wrong.');
    if (fault && photos.length === 0) return setError('Add at least one photo showing the problem.');

    setBusy(true);
    const supabase = createBrowserSupabase();
    try {
      const uploaded = [...photos];
      for (const [i, photo] of uploaded.entries()) {
        if (photo.path) continue;
        const ext = photo.file.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
        const path = `${photoFolder}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('return-photos')
          .upload(path, photo.file, { contentType: photo.file.type });
        if (uploadError) {
          console.error(uploadError);
          setError('A photo didn’t upload. Check your connection and try again.');
          return;
        }
        uploaded[i] = { ...photo, path };
        setPhotos([...uploaded]);
      }

      const { data, error: requestError } = await supabase.rpc('request_return', {
        p_order_token: token,
        p_items: chosen.map((i) => ({ order_item_id: i.id, quantity: quantities[i.id] })),
        p_reason: reason,
        p_details: details,
        p_photo_paths: uploaded.map((p) => p.path!),
      });
      if (requestError) {
        setError(requestError.code === '22023' ? requestError.message : 'That didn’t go through. Please try again.');
        return;
      }
      setCaseNumber(data);
    } finally {
      setBusy(false);
    }
  };

  if (caseNumber) {
    return (
      <section className={styles.done} role="status">
        <h2>Return requested</h2>
        <span>Your return number</span>
        <span className={styles.caseNumber}>{caseNumber}</span>
        <p>
          We’ll review it and text you with the next step. You can follow it on your order page for {orderNumber}.
        </p>
        <Link href={`/orders/${token}`} className={styles.secondary}>
          Back to your order
        </Link>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className={`${styles.panel} ${styles.form}`}>
      <fieldset disabled={busy} className={styles.fieldset}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.field}>What are you returning?</legend>
          <ul className={styles.lines}>
            {items.map((item) => {
              const label = `${item.name}${item.sizeLabel ? `, ${item.sizeLabel}` : ''}`;
              return (
                <li key={item.id} className={styles.line} data-disabled={!item.returnable && reason !== '' && !fault}>
                  <ProductImage
                    image={asImageKey(item.image)}
                    photo={item.photo ?? undefined}
                    tint={item.tint ?? '#EAEAEA'}
                    kind={item.kind ?? 'gift'}
                    alt=""
                    sizes="64px"
                    className={styles.lineImage}
                  />
                  <span className={styles.lineText}>
                    <strong>{label}</strong>
                    {!item.returnable && (
                      <span className={styles.muted}>Can only be returned if it arrived damaged, wrong or expired.</span>
                    )}
                    {item.returnNote && <span className={styles.muted}>{item.returnNote}</span>}
                  </span>
                  <label>
                    <span className="visually-hidden">How many of {label} to return</span>
                    <select
                      className={styles.qtySelect}
                      value={quantities[item.id] ?? 0}
                      onChange={(e) => setQuantities((q) => ({ ...q, [item.id]: Number(e.target.value) }))}
                    >
                      {Array.from({ length: item.available + 1 }, (_, n) => (
                        <option key={n} value={n}>
                          {n === 0 ? 'Not returning' : `Return ${n}`}
                        </option>
                      ))}
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <label className={styles.field}>
          Reason
          <select name="reason" required value={reason} onChange={(e) => setReason(e.target.value as ReturnReason | '')}>
            <option value="">Choose a reason</option>
            {(Object.keys(returnReasons) as ReturnReason[]).map((r) => (
              <option key={r} value={r}>
                {returnReasons[r]}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>
            Details <span className={styles.optional}>{reason === 'other' ? '(required)' : '(optional)'}</span>
          </span>
          <textarea name="details" maxLength={2000} placeholder="What happened? For damage, tell us what you found when you opened it." />
        </label>

        <div className={styles.field}>
          <span>
            Photos <span className={styles.optional}>{fault ? '(at least one, up to 3)' : '(up to 3)'}</span>
          </span>
          {photos.length > 0 && (
            <div className={styles.photos}>
              {photos.map((p, i) => (
                <div key={p.preview} className={styles.photo}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local preview, not a hosted image */}
                  <img src={p.preview} alt={`Photo ${i + 1}: ${p.file.name}`} />
                  <button type="button" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <input
              type="file"
              accept={PHOTO_TYPES.join(',')}
              multiple
              aria-label="Add photos"
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = '';
              }}
            />
          )}
          <small>Show the product, its packaging and any damage. Only our team can see your photos.</small>
        </div>

        <button type="submit" className={styles.primary}>
          {busy ? 'Sending…' : 'Request return'}
        </button>
      </fieldset>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
    </form>
  );
}
