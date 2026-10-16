'use client';

import { ActionForm } from '../ActionForm';
import { receiveStock } from './actions';
import styles from '../admin.module.css';

export interface SkuOption {
  value: string;
  label: string;
  needsExpiry: boolean;
}

/** Records a delivery from a supplier into a batch (PRD FR-102). */
export function ReceiveForm({ skus, defaultSku }: { skus: SkuOption[]; defaultSku?: string }) {
  return (
    <ActionForm action={receiveStock} resetOnSuccess>
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Product and size</span>
          <select name="sku" required defaultValue={defaultSku ?? ''}>
            <option value="" disabled>
              Choose…
            </option>
            {skus.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
                {s.needsExpiry ? ' (needs expiry)' : ''}
              </option>
            ))}
          </select>
        </label>
        <label className={styles.field}>
          <span>Batch number</span>
          <input name="batch" required placeholder="As printed on the pack" />
        </label>
        <label className={styles.field}>
          <span>Expiry date</span>
          <input name="expires_on" type="date" />
          <small>Required for beauty and bath products</small>
        </label>
        <label className={styles.field}>
          <span>Units received</span>
          <input name="quantity" type="number" min={1} max={100000} required />
        </label>
      </div>
      <label className={styles.field}>
        <span>Supplier or invoice reference</span>
        <input name="note" />
      </label>
      <div className={styles.buttons}>
        <button type="submit" className={styles.primary}>Receive stock</button>
      </div>
    </ActionForm>
  );
}
