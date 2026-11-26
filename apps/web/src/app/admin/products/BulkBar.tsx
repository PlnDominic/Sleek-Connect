'use client';

import { useState } from 'react';
import { ActionForm } from '../ActionForm';
import { bulkUpdateProducts } from './actions';
import styles from '../admin.module.css';

const FORM_ID = 'bulk-products';

type Choice = 'publish' | 'unpublish' | 'price' | 'sale' | 'end_sale' | 'category' | 'skin_types' | 'size_guide';

const choices: { value: Choice; label: string }[] = [
  { value: 'publish', label: 'Show on the store' },
  { value: 'unpublish', label: 'Hide from the store' },
  { value: 'price', label: 'Change prices' },
  { value: 'sale', label: 'Start a sale' },
  { value: 'end_sale', label: 'End a sale' },
  { value: 'category', label: 'Move to a category' },
  { value: 'skin_types', label: 'Set skin types' },
  { value: 'size_guide', label: 'Set the size guide' },
];

/**
 * The bar under the products table. The row checkboxes (name="ids", form="bulk-products") are in the table; this form is
 * what they submit to. Only the fields for the chosen change are shown.
 */
export function BulkBar({
  categories,
  guides,
}: {
  categories: { id: string; name: string }[];
  guides: { id: string; title: string }[];
}) {
  const [choice, setChoice] = useState<Choice>('price');

  const setAll = (checked: boolean) => {
    document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${FORM_ID}"]`).forEach((box) => {
      box.checked = checked;
    });
  };

  return (
    <ActionForm
      id={FORM_ID}
      action={bulkUpdateProducts}
      className={styles.bulkBar}
      confirm="Apply this change to every ticked product? Prices and visibility change on the store straight away."
    >
      <div className={styles.row}>
        <div className={styles.buttons}>
          <button type="button" className={styles.secondary} onClick={() => setAll(true)}>
            Tick all on this page
          </button>
          <button type="button" className={styles.secondary} onClick={() => setAll(false)}>
            Clear
          </button>
        </div>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Change the ticked products</span>
          <select name="action" value={choice} onChange={(e) => setChoice(e.target.value as Choice)}>
            {choices.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        {choice === 'price' && (
          <>
            <label className={styles.field}>
              <span>How</span>
              <select name="price_mode" defaultValue="percent">
                <option value="percent">Up or down by a percent</option>
                <option value="amount">Add or take off an amount (GH₵)</option>
                <option value="set">Set one exact price (products with one size)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Number</span>
              <input name="price_value" inputMode="decimal" placeholder="e.g. 10 or -5" required />
              <small>Use a minus to lower prices. Every size follows.</small>
            </label>
          </>
        )}
        {choice === 'sale' && (
          <label className={styles.field}>
            <span>Percent off</span>
            <input name="sale_percent" inputMode="decimal" placeholder="e.g. 20" required />
            <small>Shows the old price crossed out. End the sale to bring it back.</small>
          </label>
        )}
        {choice === 'category' && (
          <label className={styles.field}>
            <span>Category</span>
            <select name="category_id" required defaultValue="">
              <option value="" disabled>
                Choose…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {choice === 'skin_types' && (
          <>
            <label className={styles.field}>
              <span>How</span>
              <select name="skin_mode" defaultValue="add">
                <option value="add">Add to what they have</option>
                <option value="replace">Replace what they have</option>
                <option value="clear">Remove all skin types</option>
              </select>
            </label>
            <label className={styles.field}>
              <span>Skin types</span>
              <textarea name="skin_values" rows={3} placeholder={'Dry\nOily\nSensitive'} />
              <small>One per line. Not needed to remove them.</small>
            </label>
          </>
        )}
        {choice === 'size_guide' && (
          <label className={styles.field}>
            <span>Size guide</span>
            <select name="size_guide_id" defaultValue="">
              <option value="">None (remove the guide)</option>
              {guides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className={styles.buttons}>
        <button type="submit" className={styles.primary}>
          Apply to ticked products
        </button>
      </div>
    </ActionForm>
  );
}
