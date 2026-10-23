'use client';

import { useActionState, useState, useTransition, type FormEvent, type ReactNode } from 'react';
import { departmentIds, departmentLabels } from '@sleek/shared';
import type { ActionState } from '@/lib/admin/action-state';
import { kidsFilters, problemFields, productKinds, type ProductPayload, type SizePayload } from '@/lib/admin/product-payload';
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
  problems: string[];
  canEdit: boolean;
}

const blankSize: SizePayload = { code: '', label: '', price_ghs: '' };

export function ProductForm({ product, categories, ageBands, imageKeys, problems, canEdit }: ProductFormProps) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveProduct, null);
  const [, startTransition] = useTransition();
  // Submit through a transition so a refused save keeps everything that was typed.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
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

  return (
    <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={pending || !canEdit} className={styles.fieldset}>
        {product?.id && <input type="hidden" name="id" value={product.id} />}
        <input type="hidden" name="sizes_json" value={JSON.stringify(sizes)} />

        <section className={styles.panel}>
          <h2>Basics</h2>
          <div className={styles.row}>
            {field('name', 'Name', <input name="name" required maxLength={120} defaultValue={product?.name} />)}
            {field('brand', 'Brand', <input name="brand" defaultValue={product?.brand} />)}
          </div>
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
                'Kids filter',
                <select name="kids_filter" defaultValue={product?.kids_filter ?? ''}>
                  <option value="">None</option>
                  {kidsFilters.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>,
                'Bath products count as cosmetics',
              )}
            {field(
              'kind',
              'Placeholder picture',
              <select name="kind" defaultValue={product?.kind ?? 'bottle'}>
                {productKinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>,
              'Shown when there is no photo',
            )}
          </div>
          <div className={styles.row}>
            {field(
              'slug',
              'Web address',
              <input name="slug" defaultValue={product?.slug} placeholder="Made from the name" />,
              '/products/…',
            )}
            {field(
              'image_key',
              'Photo',
              <select name="image_key" defaultValue={product?.image_key ?? ''}>
                <option value="">No photo yet</option>
                {imageKeys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>,
            )}
            {field('badge', 'Badge', <input name="badge" defaultValue={product?.badge} placeholder="e.g. New, -20%" />)}
          </div>
          {field('tag', 'Card line', <input name="tag" defaultValue={product?.tag} placeholder="e.g. Ages 0+ · Tear-free" />)}
          {field('summary', 'Short summary', <input name="summary" defaultValue={product?.summary} />)}
        </section>

        <section className={styles.panel}>
          <h2>Price and sizes</h2>
          {sizes.length === 0 ? (
            <div className={styles.row}>
              {field('price_ghs', 'Price (GH₵)', <input name="price_ghs" inputMode="decimal" defaultValue={String(product?.price_ghs ?? '')} />)}
              {field('was_price_ghs', 'Was (GH₵)', <input name="was_price_ghs" inputMode="decimal" defaultValue={String(product?.was_price_ghs ?? '')} />, 'Shown crossed out')}
            </div>
          ) : (
            <>
              <p className={styles.muted}>The price shown on product cards is the default size’s price.</p>
              {field('was_price_ghs', 'Was (GH₵)', <input name="was_price_ghs" inputMode="decimal" defaultValue={String(product?.was_price_ghs ?? '')} />)}
            </>
          )}
          {sizes.map((s, i) => (
            <div className={styles.row} key={i}>
              <label className={styles.field}>
                <span>Size code</span>
                <input value={s.code} onChange={(e) => updateSize(i, { code: e.target.value })} placeholder="e.g. 200" aria-label={`Size ${i + 1} code`} />
              </label>
              <label className={styles.field}>
                <span>Label</span>
                <input value={s.label} onChange={(e) => updateSize(i, { label: e.target.value })} placeholder="e.g. 200 ml" aria-label={`Size ${i + 1} label`} />
              </label>
              <label className={styles.field}>
                <span>Price (GH₵)</span>
                <input value={String(s.price_ghs)} inputMode="decimal" onChange={(e) => updateSize(i, { price_ghs: e.target.value })} aria-label={`Size ${i + 1} price`} />
              </label>
              <label className={styles.check}>
                <input type="radio" name="default_size" checked={Boolean(s.is_default)} onChange={() => updateSize(i, { is_default: true })} />
                Default
              </label>
              <button type="button" className={styles.linkButton} onClick={() => setSizes((all) => all.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" className={styles.secondary} onClick={() => setSizes((all) => [...all, { ...blankSize, is_default: all.length === 0 }])}>
            Add a size
          </button>
        </section>

        <section className={styles.panel}>
          <h2>Product page and compliance</h2>
          <p className={styles.muted}>
            Products can only go on the store when these are filled in (PRD FR-100).{' '}
            Beauty and bath products also need their FDA registration number.
          </p>
          {field('description', 'Description', <textarea name="description" defaultValue={product?.description} />)}
          <div className={styles.row}>
            {field('highlights', 'Highlights', <textarea name="highlights" defaultValue={product?.highlights?.join('\n')} />, 'One per line')}
            {field('free_from', 'Free from', <textarea name="free_from" defaultValue={product?.free_from?.join('\n')} />, 'One per line')}
          </div>
          {field(
            'ingredients',
            cosmetic ? 'Ingredients (INCI list)' : 'Ingredients or materials',
            <textarea name="ingredients" defaultValue={product?.ingredients} />,
            'As printed on the pack',
          )}
          {field(
            'warning_label',
            'Safety warning label',
            <input name="warning_label" defaultValue={product?.warning_label} maxLength={200} placeholder="e.g. Choking hazard: small parts. Not for children under 3." />,
            'Short and prominent: shown above “Add to bag” and in the bag. Leave empty if none.',
          )}
          {field('warnings', 'Safety notes', <textarea name="warnings" defaultValue={product?.warnings} />, 'The full safety notes, shown in the product details')}
          {field('how_to_use', 'How to use', <textarea name="how_to_use" defaultValue={product?.how_to_use} />)}
          <div className={styles.row}>
            {field('country_of_origin', 'Country of origin', <input name="country_of_origin" defaultValue={product?.country_of_origin} />)}
            {field('regulatory_reference', 'FDA registration number', <input name="regulatory_reference" defaultValue={product?.regulatory_reference} />)}
            {field('period_after_opening', 'Use within after opening', <input name="period_after_opening" defaultValue={product?.period_after_opening} placeholder="e.g. 12M" />)}
          </div>
          {cosmetic && (
            <div className={styles.row}>
              {field('skin_types', 'Skin types', <textarea name="skin_types" defaultValue={product?.skin_types?.join('\n')} />, 'One per line, e.g. Dry, Oily, Sensitive. Used by the shop filters.')}
              {field('shades', 'Shades', <textarea name="shades" defaultValue={product?.shades?.join('\n')} />, 'One per line, for makeup. Used by the shop filters.')}
            </div>
          )}
          {department === 'kids' && (
            <>
              {field('recommended_age', 'Recommended age', <input name="recommended_age" defaultValue={product?.recommended_age} placeholder="e.g. From birth (0+)" />)}
              <fieldset className={styles.field} data-missing={missing.has('recommended_age') || undefined}>
                <span>Age bands (for Shop by age)</span>
                <div className={styles.checks}>
                  {ageBands.map((b) => (
                    <label key={b.id} className={styles.check}>
                      <input type="checkbox" name="age_bands" value={b.id} defaultChecked={product?.age_bands.includes(b.id)} />
                      {b.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </section>

        <section className={styles.panel}>
          <h2>Returns</h2>
          <label className={styles.check}>
            <input type="checkbox" name="returnable" defaultChecked={product?.returnable ?? true} />
            Can be returned within the return window
          </label>
          <p className={styles.muted}>
            Untick for items that can’t come back once opened (e.g. lipstick, opened skincare). Customers can still return
            them if they arrive damaged, wrong or expired.
          </p>
          {field('return_note', 'Return note', <input name="return_note" defaultValue={product?.return_note} maxLength={200} placeholder="e.g. Unopened and sealed only." />, 'Optional, shown on the product page')}
        </section>

        <section className={styles.panel}>
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
          {state && (
            <p role={state.ok ? 'status' : 'alert'} className={state.ok ? styles.success : styles.error}>
              {state.message}
            </p>
          )}
        </section>
      </fieldset>
    </form>
  );
}
