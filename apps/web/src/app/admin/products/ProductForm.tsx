'use client';

import { useActionState, useEffect, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { departmentIds, departmentLabels } from '@sleek/shared';
import type { ActionState } from '@/lib/admin/action-state';
import { kidsFilters, problemFields, type ProductPayload, type SizePayload } from '@/lib/admin/product-payload';
import { Toast } from '../Toast';
import { saveProduct } from './actions';
import styles from '../admin.module.css';

interface Option {
  id: string;
  name: string;
  department?: string;
}

interface ProductFormProps {
  product?: ProductPayload;
  categories: Option[];
  ageBands: Option[];
  imageKeys: string[];
  /** The size guides a product can be given, and the one it has now. */
  sizeGuides?: Option[];
  sizeGuideId?: string | null;
  problems: string[];
  canEdit: boolean;
}

const blankSize: SizePayload = { code: '', label: '', price_ghs: '' };

/** A size's code is made from its label ("200 ml" becomes "200-ml") unless it already has one, so staff only type a label and a price. */
const codeFor = (s: SizePayload) => s.code || s.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/**
 * Only what a product needs: its name, where it sits, its price (and sizes if it has them), a description, and for cosmetics the FDA
 * number. Everything else the product already has (highlights, skin types, size guide…) is kept untouched in hidden fields, so editing
 * a product here never erases it.
 */
export function ProductForm({ product, categories, ageBands, sizeGuideId, problems, canEdit }: ProductFormProps) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProduct, null);
  const [, startTransition] = useTransition();
  // Submit through a transition so a refused save keeps everything that was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
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
      <fieldset disabled={pending || !canEdit} className={styles.fieldset}>
        {product?.id && <input type="hidden" name="id" value={product.id} />}
        <input type="hidden" name="sizes_json" value={JSON.stringify(sizes.map((s) => ({ ...s, code: codeFor(s) })))} />
        {/* Kept as they are, not shown. */}
        {keep('kind', product?.kind ?? 'bottle')}
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
          {department === 'kids' && ageBands.length > 0 && (
            <fieldset className={styles.field}>
              <span>Ages (optional, for Shop by age)</span>
              <div className={styles.checks}>
                {ageBands.map((b) => (
                  <label key={b.id} className={styles.check}>
                    <input type="checkbox" name="age_bands" value={b.id} defaultChecked={product?.age_bands.includes(b.id)} />
                    {b.name}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </section>

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
              {pending ? 'Saving…' : product?.id ? 'Save changes' : 'Create product'}
            </button>
          </div>
          {dirty && !pending && <p className={styles.unsaved}>You have unsaved changes.</p>}
          <Toast state={state} />
        </section>
      </fieldset>
    </form>
  );
}
