'use client';

import { useActionState, useState, useTransition, type FormEvent } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import { Toast } from '../../Toast';
import { applyStockCount } from './actions';
import styles from '../../admin.module.css';

export interface CountBatch {
  id: string;
  product: string;
  batch: string;
  expires: string;
  quantity: number;
  status: string;
}

/** A shelf count: type what you counted for each batch you checked. Empty rows are left alone; differences are recorded as found or lost. */
export function CountForm({ batches }: { batches: CountBatch[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(applyStockCount, null);
  const [, startTransition] = useTransition();
  const [counted, setCounted] = useState<Record<string, string>>({});
  const differences = batches.filter((b) => counted[b.id] !== undefined && counted[b.id] !== '' && Number(counted[b.id]) !== b.quantity).length;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set('counts_json', JSON.stringify(batches.filter((b) => counted[b.id] !== undefined && counted[b.id] !== '').map((b) => ({ batch_id: b.id, counted: Number(counted[b.id]) }))));
    if (differences > 0 && !window.confirm(`Correct ${differences} batch${differences === 1 ? '' : 'es'} to the counted quantity?`)) return;
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={pending} className={styles.fieldset}>
        <section className={styles.panel}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th className={styles.num}>In the system</th>
                  <th className={styles.num}>Counted</th>
                  <th className={styles.num}>Difference</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const c = counted[b.id];
                  const diff = c === undefined || c === '' ? null : Number(c) - b.quantity;
                  return (
                    <tr key={b.id}>
                      <td>
                        {b.product}
                        {b.status !== 'available' && <span className={styles.badge}> {b.status}</span>}
                      </td>
                      <td>{b.batch}</td>
                      <td>{b.expires || '–'}</td>
                      <td className={styles.num}>{b.quantity}</td>
                      <td className={styles.num}>
                        <input
                          value={c ?? ''}
                          inputMode="numeric"
                          onChange={(e) => setCounted((all) => ({ ...all, [b.id]: e.target.value.replace(/[^\d]/g, '') }))}
                          aria-label={`Counted ${b.product} batch ${b.batch}`}
                          style={{ width: 80, textAlign: 'right' }}
                        />
                      </td>
                      <td className={styles.num} style={{ color: diff ? (diff < 0 ? 'var(--c-danger, #b42318)' : 'var(--c-accent)') : undefined }}>
                        {diff === null ? '' : diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
        <section className={styles.panel}>
          <label className={styles.field}>
            <span>Note (optional)</span>
            <input name="note" maxLength={120} placeholder="e.g. Monthly shelf count" />
          </label>
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              {pending ? 'Saving…' : differences > 0 ? `Save count (${differences} difference${differences === 1 ? '' : 's'})` : 'Save count'}
            </button>
          </div>
        </section>
        <Toast state={state} />
      </fieldset>
    </form>
  );
}
