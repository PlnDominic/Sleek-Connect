import type { ReactNode } from 'react';
import styles from '../admin.module.css';

export interface Promotion {
  id: string;
  code: string;
  label: string;
  kind: 'percent' | 'fixed' | 'free_delivery';
  value: number;
  minimum_spend_ghs: number;
  starts_at: string;
  ends_at: string | null;
  max_uses: number | null;
  used_count: number;
  first_order_only: boolean;
  allowed_slugs: string[] | null;
  allowed_categories: string[] | null;
  active: boolean;
  orders: number;
  discount_given_ghs: number;
}

/** A date for an <input type="datetime-local"> (Accra time, which is UTC all year). */
const local = (iso: string | null) => (iso ? iso.slice(0, 16) : '');

/** The fields of a promo code, for creating one and for editing. The code itself is fixed once it exists. */
export function PromotionFields({ promo, categories, children }: { promo?: Promotion; categories: { id: string; name: string }[]; children?: ReactNode }) {
  return (
    <>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Code</span>
          <input name="code" required minLength={3} maxLength={30} defaultValue={promo?.code} readOnly={Boolean(promo)} placeholder="LAUNCH15" style={{ textTransform: 'uppercase' }} autoComplete="off" />
          {promo ? <small>The code can’t be changed once it exists.</small> : <small>Letters, numbers and dashes. Shoppers type it at checkout.</small>}
        </label>
        <label className={styles.field}>
          <span>What shoppers see</span>
          <input name="label" required minLength={3} maxLength={80} defaultValue={promo?.label} placeholder="15% off launch week" />
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Type</span>
          <select name="kind" defaultValue={promo?.kind ?? 'percent'}>
            <option value="percent">Percent off the items</option>
            <option value="fixed">Amount off the items (GH₵)</option>
            <option value="free_delivery">Free delivery</option>
          </select>
        </label>
        <label className={styles.field}>
          <span>Value</span>
          <input name="value" type="number" min={0} step="0.01" defaultValue={promo?.value ?? ''} placeholder="15" />
          <small>Percent (1 to 90) or GH₵. Not used for free delivery.</small>
        </label>
        <label className={styles.field}>
          <span>Minimum spend (GH₵)</span>
          <input name="minimum_spend_ghs" type="number" min={0} step="0.01" defaultValue={promo?.minimum_spend_ghs || ''} placeholder="No minimum" />
        </label>
      </div>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Starts</span>
          <input name="starts_at" type="datetime-local" defaultValue={local(promo?.starts_at ?? null)} />
          <small>Empty means now. Times are Accra time.</small>
        </label>
        <label className={styles.field}>
          <span>Ends</span>
          <input name="ends_at" type="datetime-local" defaultValue={local(promo?.ends_at ?? null)} />
          <small>Empty means it doesn’t end.</small>
        </label>
        <label className={styles.field}>
          <span>Most uses</span>
          <input name="max_uses" type="number" min={1} step={1} defaultValue={promo?.max_uses ?? ''} placeholder="No limit" />
          {promo && <small>Used {promo.used_count} so far.</small>}
        </label>
      </div>
      <details>
        <summary>Only for certain products (optional)</summary>
        <div className={styles.fieldset} style={{ marginTop: 12 }}>
          <label className={styles.field}>
            <span>Product addresses</span>
            <input name="allowed_slugs" defaultValue={promo?.allowed_slugs?.join(', ') ?? ''} placeholder="argan-hair-oil, shea-body-butter" />
            <small>The last part of a product’s web address, separated by commas. The order needs at least one of them.</small>
          </label>
          <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
            <span>Categories</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
              {categories.map((c) => (
                <label key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input type="checkbox" name="allowed_categories" value={c.id} defaultChecked={promo?.allowed_categories?.includes(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
            <small>The order needs at least one product in a ticked category.</small>
          </fieldset>
        </div>
      </details>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" name="first_order_only" defaultChecked={promo?.first_order_only} />
        First order only (shoppers who are signed in and have never ordered)
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input type="checkbox" name="active" defaultChecked={promo?.active ?? true} />
        Switched on
      </label>
      {children}
    </>
  );
}
