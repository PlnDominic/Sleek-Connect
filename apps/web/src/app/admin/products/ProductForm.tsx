'use client';

import { useActionState, useEffect, useMemo, useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { departmentIds, departmentLabels } from '@sleek/shared';
import type { ActionState } from '@/lib/admin/action-state';
import { kidsFilters, problemFields, type ProductPayload, type SizePayload } from '@/lib/admin/product-payload';
import { createBrowserSupabase } from '@/lib/supabase/browser';
import { Toast } from '../Toast';
import { addProductPhoto, saveProduct } from './actions';
import styles from '../admin.module.css';

interface Option {
  id: string;
  name: string;
  department?: string;
}

interface ProductFormProps {
  product?: ProductPayload;
  categories: Option[];
  imageKeys: string[];
  /** The size guides a product can be given, and the one it has now. */
  sizeGuides?: Option[];
  sizeGuideId?: string | null;
  problems: string[];
  canEdit: boolean;
}

const blankSize: SizePayload = { code: '', label: '', price_ghs: '' };

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const PHOTO_MAX = 8;

/** A size's code is made from its label ("200 ml" becomes "200-ml") unless it already has one, so staff only type a label and a price. */
const codeFor = (s: SizePayload) => s.code || s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Only what a product needs: its name, where it sits, its price (and sizes if it has them), a description, and for cosmetics the FDA
 * number. Everything else the product already has (highlights, skin types, size guide…) is kept untouched in hidden fields, so editing
 * a product here never erases it.
 */
export function ProductForm({ product, categories, sizeGuideId, problems, canEdit }: ProductFormProps) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProduct, null);
  const [, startTransition] = useTransition();
  const router = useRouter();
  // Photos chosen while adding a new product. They upload right after the product is saved (an existing product uses the Photos panel).
  const [files, setFiles] = useState<File[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [uploading, setUploading] = useState(false);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const picked = [...(event.target.files ?? [])];
    event.target.value = '';
    const bad = picked.find((f) => !PHOTO_TYPES.includes(f.type) || f.size > PHOTO_MAX_BYTES);
    if (bad) return setPhotoError(`${bad.name}: use JPEG, PNG or WebP photos under 5 MB.`);
    if (files.length + picked.length > PHOTO_MAX) return setPhotoError(`A product can have up to ${PHOTO_MAX} photos.`);
    setPhotoError('');
    setFiles((all) => [...all, ...picked]);
  };
  // Submit through a transition so a refused save keeps everything that was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (product?.id || files.length === 0) return startTransition(() => action(data));
    // New product with photos: save it, upload the photos, then open it.
    data.set('stay', '1');
    setUploading(true);
    setPhotoError('');
    startTransition(async () => {
      const saved = await saveProduct(null, data);
      if (!saved?.ok || !saved.id) {
        setUploading(false);
        return setPhotoError(saved?.message ?? 'That didn’t work. Please try again.');
      }
      const storage = createBrowserSupabase().storage.from('product-images');
      let failed = 0;
      for (const file of files) {
        const ext = file.type === 'image/jpeg' ? 'jpg' : file.type.split('/')[1];
        const path = `${saved.id}/${crypto.randomUUID()}.${ext}`;
        const { error } = await storage.upload(path, file, { contentType: file.type, cacheControl: '31536000' });
        if (error) {
          console.error(error);
          failed += 1;
          continue;
        }
        const added = await addProductPhoto(saved.id, path);
        if (!added.ok) failed += 1;
      }
      const note = failed ? `Product created, but ${failed} photo${failed === 1 ? '' : 's'} didn’t upload. Add them below.` : 'Product created with its photos.';
      router.push(`/admin/products/${saved.id}?done=${encodeURIComponent(note)}`);
    });
  };
  // Edits made since the last successful save (or since the page opened).
  const [editedAt, setEditedAt] = useState<{ result: ActionState } | null>(null);
  const dirty = editedAt !== null && !(state?.ok && state !== editedAt.result);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const [department, setDepartment] = useState(product?.department ?? 'beauty');
  const [sizes, setSizes] = useState<SizePayload[]>(product?.sizes ?? []);
  const missing = new Set(problems.map((p) => problemFields[p]).filter(Boolean));
  const cosmetic = department === 'beauty';

  const field = (name: string, label: string, input: ReactNode, hint?: string) => (
    <label className={styles.field} data-missing={missing.has(name) || undefined}>
      <span>{label}</span>
      {input}
      {hint && <small>{hint}</small>}
    </label>
  );
  const updateSize = (i: number, patch: Partial<SizePayload>) =>
    setSizes((all) => all.map((s, j) => (j === i ? { ...s, ...patch } : patch.is_default ? { ...s, is_default: false } : s)));
  const keep = (name: string, value: string | undefined) => <textarea key={name} name={name} defaultValue={value ?? ''} hidden readOnly />;

  return (
    <form onSubmit={submit} onInput={() => setEditedAt((e) => (dirty && e ? e : { result: state }))} className={styles.form}>
      <fieldset disabled={pending || uploading || !canEdit} className={styles.fieldset}>
        {product?.id && <input type="hidden" name="id" value={product.id} />}
        <input type="hidden" name="sizes_json" value={JSON.stringify(sizes.map((s) => ({ ...s, code: codeFor(s) })))} />
        {/* Kept as they are, not shown. */}
        {keep('kind', product?.kind ?? (department === 'beauty' ? 'bottle' : department === 'kids' ? 'toy' : 'box'))}
        {keep('slug', product?.slug)}
        {keep('image_key', product?.image_key)}
        {keep('badge', product?.badge)}
        {keep('tag', product?.tag)}
        {keep('summary', product?.summary)}
        {keep('highlights', product?.highlights?.join('\n'))}
        {keep('free_from', product?.free_from?.join('\n'))}
        {keep('how_to_use', product?.how_to_use)}
        {keep('warnings', product?.warnings)}
        {keep('country_of_origin', product?.country_of_origin)}
        {keep('recommended_age', product?.recommended_age)}
        {keep('warning_label', product?.warning_label)}
        {keep('size_guide_id', sizeGuideId ?? '')}
        {keep('size_guide_before', sizeGuideId ?? '')}
        {keep('period_after_opening', product?.period_after_opening)}
        {keep('skin_types', product?.skin_types?.join('\n'))}
        {keep('shades', product?.shades?.join('\n'))}
        {keep('return_note', product?.return_note)}

        <section className={styles.panel} id="basics">
          <h2>Product</h2>
          {field('name', 'Name', <input name="name" required maxLength={120} defaultValue={product?.name} />)}
          <div className={styles.row}>
            {field(
              'department',
              'Department',
              <select name="department" value={department} onChange={(e) => setDepartment(e.target.value)}>
                {departmentIds.map((d) => (
                  <option key={d} value={d}>{departmentLabels[d]}</option>
                ))}
              </select>,
            )}
            {field(
              'category_id',
              'Category',
              <select name="category_id" defaultValue={product?.category_id ?? ''}>
                <option value="">Choose…</option>
                {categories
                  .filter((c) => c.department === department)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>,
            )}
            {department === 'kids' &&
              field(
                'kids_filter',
                'Type',
                <select name="kids_filter" defaultValue={product?.kids_filter ?? ''}>
                  <option value="">Other</option>
                  {kidsFilters.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>,
                'Bath products count as cosmetics',
              )}
          </div>
          {field('description', 'Description', <textarea name="description" rows={3} defaultValue={product?.description} />)}
          <div className={styles.row}>
            {field('brand', 'Brand (optional)', <input name="brand" defaultValue={product?.brand} />)}
            {cosmetic &&
              field('regulatory_reference', 'FDA registration number', <input name="regulatory_reference" defaultValue={product?.regulatory_reference} />, 'Needed for cosmetics')}
          </div>
          {cosmetic && field('ingredients', 'Ingredients (optional)', <textarea name="ingredients" rows={2} defaultValue={product?.ingredients} />, 'As printed on the pack')}
          {!cosmetic && <input type="hidden" name="regulatory_reference" value={product?.regulatory_reference ?? ''} />}
          {!cosmetic && <input type="hidden" name="ingredients" value={product?.ingredients ?? ''} />}
        </section>

        {!product?.id && (
          <section className={styles.panel} id="photos">
            <h2>Photos</h2>
            <p className={styles.muted}>
              The first photo is the main one on the store. Up to {PHOTO_MAX} photos; JPEG, PNG or WebP under 5 MB. They upload when you create the product.
            </p>
            {files.length > 0 && (
              <ol className={styles.photos}>
                {files.map((f, i) => (
                  <li key={`${f.name}-${i}`} className={styles.photo}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of a file not uploaded yet */}
                    <img src={previews[i]} alt={f.name} width={120} height={120} className={styles.photoImage} />
                    <div className={styles.photoBody}>
                      {i === 0 && <span className={styles.badge} data-tone="good">Main photo</span>}
                      <div className={styles.buttons}>
                        <button type="button" className={styles.secondary} disabled={i === 0} aria-label={`Move photo ${i + 1} earlier`}
                          onClick={() => setFiles((all) => { const n = [...all]; const [p] = n.splice(i, 1); n.splice(i - 1, 0, p); return n; })}>↑</button>
                        <button type="button" className={styles.danger} onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}>Remove</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {files.length < PHOTO_MAX && (
              <label className={styles.secondary}>
                {files.length === 0 ? 'Choose photos' : 'Add more photos'}
                <input type="file" accept={PHOTO_TYPES.join(',')} multiple hidden onChange={choose} />
              </label>
            )}
            {photoError && <p role="alert" className={styles.error}>{photoError}</p>}
          </section>
        )}

        <section className={styles.panel} id="pricing">
          <h2>Price</h2>
          {sizes.length === 0 ? (
            <div className={styles.row}>
              {field('price_ghs', 'Price (GH₵)', <input name="price_ghs" inputMode="decimal" defaultValue={String(product?.price_ghs ?? '')} />)}
              {field('was_price_ghs', 'Old price (GH₵, optional)', <input name="was_price_ghs" inputMode="decimal" defaultValue={String(product?.was_price_ghs ?? '')} />, 'Shown crossed out')}
            </div>
          ) : (
            <>
              <p className={styles.muted}>The price on product cards is the default size’s price.</p>
              {field('was_price_ghs', 'Old price (GH₵, optional)', <input name="was_price_ghs" inputMode="decimal" defaultValue={String(product?.was_price_ghs ?? '')} />)}
              {sizes.map((s, i) => (
                <div className={styles.row} key={i}>
                  <label className={styles.field}>
                    <span>Size</span>
                    <input value={s.label} onChange={(e) => updateSize(i, { label: e.target.value })} placeholder="e.g. 200 ml" aria-label={`Size ${i + 1} name`} />
                  </label>
                  <label className={styles.field}>
                    <span>Price (GH₵)</span>
                    <input value={String(s.price_ghs)} inputMode="decimal" onChange={(e) => updateSize(i, { price_ghs: e.target.value })} aria-label={`Size ${i + 1} price`} />
                  </label>
                  {sizes.length > 1 && (
                    <label className={styles.check}>
                      <input type="radio" name="default_size" checked={Boolean(s.is_default)} onChange={() => updateSize(i, { is_default: true })} />
                      Default
                    </label>
                  )}
                  <button type="button" className={styles.linkButton} onClick={() => setSizes((all) => all.filter((_, j) => j !== i))}>
                    Remove
                  </button>
                </div>
              ))}
            </>
          )}
          <button type="button" className={styles.secondary} onClick={() => setSizes((all) => [...all, { ...blankSize, is_default: all.length === 0 }])}>
            {sizes.length === 0 ? 'This product has sizes' : 'Add another size'}
          </button>
        </section>

        <section className={`${styles.panel} ${styles.saveBar}`}>
          <label className={styles.check}>
            <input type="checkbox" name="returnable" defaultChecked={product?.returnable ?? true} />
            Can be returned (untick for items that can’t come back once opened)
          </label>
          <label className={styles.check}>
            <input type="checkbox" name="publish" defaultChecked={product?.publish ?? false} />
            Show on the store
          </label>
          {problems.length > 0 && (
            <p className={styles.notice}>
              {product?.publish ? 'Saving will take this product off the store until you add: ' : 'Needed before it can go on the store: '}
              {problems.join(', ')}.
            </p>
          )}
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              {uploading ? 'Uploading photos…' : pending ? 'Saving…' : product?.id ? 'Save changes' : 'Create product'}
            </button>
          </div>
          {dirty && !pending && <p className={styles.unsaved}>You have unsaved changes.</p>}
          <Toast state={state} />
        </section>
      </fieldset>
    </form>
  );
}
