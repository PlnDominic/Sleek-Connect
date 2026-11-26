'use client';

import { useActionState, useState, useTransition, type FormEvent } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import { formatPrice } from '@sleek/shared';
import { Toast } from '../Toast';
import { savePurchaseOrder } from './actions';
import styles from '../admin.module.css';

export interface PoSku {
  value: string;
  label: string;
}

interface Line {
  sku: string;
  quantity: string;
  unit_cost_ghs: string;
}

/** Create or edit a draft purchase order: the supplier, when it should arrive, and the products with a quantity and cost for each. */
export function PurchaseOrderForm({
  id,
  suppliers,
  skus,
  initial,
}: {
  id: string | null;
  suppliers: { id: string; name: string }[];
  skus: PoSku[];
  initial?: { supplier_id: string; expected_on: string; note: string; lines: Line[] };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePurchaseOrder.bind(null, id), null);
  const [, startTransition] = useTransition();
  const [lines, setLines] = useState<Line[]>(initial?.lines.length ? initial.lines : [{ sku: '', quantity: '', unit_cost_ghs: '' }]);
  const update = (i: number, patch: Partial<Line>) => setLines((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const total = lines.reduce((n, l) => n + (Number(l.quantity) || 0) * (Number(l.unit_cost_ghs) || 0), 0);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('lines_json', JSON.stringify(lines.filter((l) => l.sku)));
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={pending} className={styles.fieldset}>
        <section className={styles.panel}>
          <div className={styles.row}>
            <label className={styles.field}>
              <span>Supplier</span>
              <select name="supplier_id" required defaultValue={initial?.supplier_id ?? ''}>
                <option value="" disabled>
                  Choose…
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Expected on (optional)</span>
              <input name="expected_on" type="date" defaultValue={initial?.expected_on ?? ''} />
            </label>
          </div>
          <label className={styles.field}>
            <span>Note (optional)</span>
            <input name="note" maxLength={500} defaultValue={initial?.note ?? ''} />
          </label>
        </section>

        <section className={styles.panel}>
          <h2>Products</h2>
          {lines.map((l, i) => (
            <div className={styles.row} key={i}>
              <label className={styles.field}>
                <span>Product and size</span>
                <select value={l.sku} onChange={(e) => update(i, { sku: e.target.value })} aria-label={`Line ${i + 1} product`}>
                  <option value="">Choose…</option>
                  {skus.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Quantity</span>
                <input value={l.quantity} inputMode="numeric" onChange={(e) => update(i, { quantity: e.target.value })} aria-label={`Line ${i + 1} quantity`} />
              </label>
              <label className={styles.field}>
                <span>Cost each (GH₵)</span>
                <input value={l.unit_cost_ghs} inputMode="decimal" onChange={(e) => update(i, { unit_cost_ghs: e.target.value })} aria-label={`Line ${i + 1} cost each`} />
              </label>
              {lines.length > 1 && (
                <button type="button" className={styles.linkButton} onClick={() => setLines((all) => all.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          <button type="button" className={styles.secondary} onClick={() => setLines((all) => [...all, { sku: '', quantity: '', unit_cost_ghs: '' }])}>
            Add a product
          </button>
          <p className={styles.muted}>
            Order total: <strong>{formatPrice(total)}</strong>
          </p>
        </section>

        <div className={styles.buttons}>
          <button type="submit" className={styles.primary}>
            {pending ? 'Saving…' : id ? 'Save order' : 'Create draft order'}
          </button>
        </div>
        <Toast state={state} />
      </fieldset>
    </form>
  );
}
