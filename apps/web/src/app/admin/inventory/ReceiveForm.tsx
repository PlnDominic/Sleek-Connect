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
export interface SupplierOption {
  id: string;
  name: string;
}

export function ReceiveForm({ skus, suppliers, defaultSku }: { skus: SkuOption[]; suppliers: SupplierOption[]; defaultSku?: string }) {
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
      <div className={styles.row}>
        <label className={styles.field}>
          <span>Supplier</span>
          <select name="supplier" defaultValue="">
            <option value="">Not recorded</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <small>Add suppliers under Inventory → Suppliers</small>
        </label>
        <label className={styles.field}>
          <span>Cost per unit (GH₵)</span>
          <input name="unit_cost" type="number" min={0} step="0.01" inputMode="decimal" />
        </label>
        <label className={styles.field}>
          <span>Invoice or delivery reference</span>
          <input name="note" maxLength={120} />
        </label>
      </div>
      <div className={styles.buttons}>
        <button type="submit" className={styles.primary}>Receive stock</button>
      </div>
    </ActionForm>
  );
}
