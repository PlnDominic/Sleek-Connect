'use client';

import { useActionState, useState, useTransition, type FormEvent } from 'react';
import type { ActionState } from '@/lib/admin/action-state';
import { Toast } from '../Toast';
import { receivePurchaseOrder } from './actions';
import styles from '../admin.module.css';

export interface ReceiveLine {
  id: string;
  name: string;
  remaining: number;
  needs_expiry: boolean;
}

/** What arrived now: a quantity per line (up to what is still to come), the batch number and, for cosmetics, the expiry date. */
export function ReceiveOrderForm({ id, lines }: { id: string; lines: ReceiveLine[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(receivePurchaseOrder.bind(null, id), null);
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState(lines.map(() => ({ quantity: '', batch_code: '', expires_on: '' })));
  const update = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData();
    data.set('lines_json', JSON.stringify(lines.map((l, i) => ({ line_id: l.id, ...rows[i] })).filter((r) => Number(r.quantity) > 0)));
    startTransition(() => action(data));
  };

  return (
    <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={pending} className={styles.fieldset}>
        <section className={styles.panel}>
          <h2>Receive stock</h2>
          <p className={styles.muted}>Enter what arrived today, for each line. Anything still to come stays on the order.</p>
          {lines.map((l, i) => (
            <div className={styles.row} key={l.id}>
              <div className={styles.field}>
                <span>{l.name}</span>
                <small>{l.remaining} still to come</small>
              </div>
              <label className={styles.field}>
                <span>Arrived</span>
                <input value={rows[i].quantity} inputMode="numeric" max={l.remaining} onChange={(e) => update(i, { quantity: e.target.value })} aria-label={`${l.name} arrived`} />
              </label>
              <label className={styles.field}>
                <span>Batch number</span>
                <input value={rows[i].batch_code} onChange={(e) => update(i, { batch_code: e.target.value })} placeholder="As printed on the pack" aria-label={`${l.name} batch number`} />
              </label>
              <label className={styles.field}>
                <span>Expiry{l.needs_expiry ? '' : ' (optional)'}</span>
                <input type="date" value={rows[i].expires_on} onChange={(e) => update(i, { expires_on: e.target.value })} aria-label={`${l.name} expiry`} />
              </label>
            </div>
          ))}
          <div className={styles.buttons}>
            <button type="submit" className={styles.primary}>
              {pending ? 'Receiving…' : 'Receive into stock'}
            </button>
          </div>
        </section>
        <Toast state={state} />
      </fieldset>
    </form>
  );
}
